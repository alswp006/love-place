import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { softDelete, restore, ConflictError } from '@/lib/sync/versionedUpdate'
import { useOfflineQueue } from '@/state/OfflineQueueProvider'
import { useToast } from '@/hooks/useToast'

// 휴지통(R3 T16) — soft-delete된 전 엔티티 조회 + 복구를 table 파라미터화로 일반화(usePlaceTrash 후속).
// 물리삭제 금지(§4.3), 둘 다 복구 가능("상대가 지운 추억"도). 복구 경로(deleted_at IS NOT NULL 행 조회·update)는
// 0010/0012 trash-RLS 적용 후에만 라이브 동작. 색만으로 구분 금지 → kind 배지는 색+라벨+심볼(§4 / ux-and-accessibility).

export type TrashKind = 'places' | 'events' | 'visits' | 'photos' | 'trips' | 'itineraries'

type TrashKindMeta = {
  table: string
  /** kind 배지 한국어 라벨(색+라벨 이중화 §4). */
  label: string
  /** 휴지통 표시 이름을 만드는 데 필요한 select 컬럼/임베드(id·deleted_at·version은 항상 포함되므로 제외). */
  nameColumns: string[]
}

// 각 엔티티의 표시 필드 출처(02-data-model): places.name·trips.title·events.title·photos.caption.
// visits는 자체 이름 없음 → places(name)+visit_date 임베드. itineraries는 title 컬럼 없음 → 폴백('코스').
export const TRASH_KINDS: Record<TrashKind, TrashKindMeta> = {
  places: { table: 'places', label: '장소', nameColumns: ['name'] },
  events: { table: 'events', label: '일정', nameColumns: ['title'] },
  visits: { table: 'visits', label: '방문', nameColumns: ['visit_date', 'places(name)'] },
  photos: { table: 'photos', label: '사진', nameColumns: ['caption'] },
  trips: { table: 'trips', label: '여행', nameColumns: ['title'] },
  itineraries: { table: 'itineraries', label: '코스', nameColumns: [] },
}

// 정규화된 휴지통 행 — kind 무관 공통 형태(섹션 UI가 단일 타입으로 렌더).
export type TrashRow = {
  id: string
  label: string
  kind: TrashKind
  deleted_at: string
  version: number
}

/** kind별로 표시 이름을 고른다(events.title / trips.title / places.name / photos.caption||'사진' /
 *  visits→장소명+방문일 / itineraries→'코스'). 순수 함수(테스트로 못박음). */
export function trashLabelOf(kind: TrashKind, row: Record<string, unknown>): string {
  switch (kind) {
    case 'places':
      return (row.name as string | null) ?? '장소'
    case 'events':
    case 'trips':
      return (row.title as string | null) ?? TRASH_KINDS[kind].label
    case 'photos':
      return (row.caption as string | null) || '사진'
    case 'visits': {
      const place = row.places as { name?: string | null } | null
      const name = place?.name ?? '방문'
      const date = (row.visit_date as string | null) ?? ''
      return date ? `${name} · ${date}` : name
    }
    case 'itineraries':
      return (row.title as string | null) ?? '코스'
  }
}

const selectColumns = (kind: TrashKind): string =>
  ['id', ...TRASH_KINDS[kind].nameColumns, 'deleted_at', 'version'].join(', ')

// 삭제된 항목 목록(deleted_at IS NOT NULL). 키는 ['trash', kind, coupleId].
export function useTrash(kind: TrashKind, coupleId: string | null, enabled: boolean) {
  return useQuery<TrashRow[]>({
    queryKey: ['trash', kind, coupleId],
    enabled: Boolean(coupleId && isSupabaseConfigured) && enabled,
    queryFn: async () => {
      if (!coupleId) return []
      const { data, error } = await supabase
        .from(TRASH_KINDS[kind].table)
        .select(selectColumns(kind))
        .eq('couple_id', coupleId)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
      if (error) throw new Error(error.message)
      return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
        id: row.id as string,
        label: trashLabelOf(kind, row),
        kind,
        deleted_at: row.deleted_at as string,
        version: row.version as number,
      }))
    },
  })
}

// 휴지통에서 복구(restore) — 일반화. 낙관적 락(0행=충돌) → onConflict, 오프라인이면 ${table}.restore로 큐잉.
export function useRestore(kind: TrashKind, coupleId: string | null, myId: string | null, onConflict: () => void) {
  const queryClient = useQueryClient()
  const { enqueue } = useOfflineQueue()
  const table = TRASH_KINDS[kind].table
  const mutation = useMutation<void, Error, { id: string; expectedVersion: number }>({
    mutationFn: async ({ id, expectedVersion }) => {
      if (!myId) throw new Error('로그인이 필요해요.')
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await enqueue(`${table}.restore`, { id, expectedVersion, myId }, `${table}.restore:${id}`)
        return
      }
      const res = await restore(table, id, expectedVersion, myId)
      if (res.status === 'conflict') throw new ConflictError()
    },
    onError: (err) => {
      if (err instanceof ConflictError) onConflict()
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['trash', kind, coupleId] })
      void queryClient.invalidateQueries({ queryKey: [table, coupleId] })
    },
  })
  return { restore: mutation.mutate, isPending: mutation.isPending }
}

// 삭제 즉시 '되돌리기' Undo(R1.5 토스트 패턴) — 방문·여행·일정 한 구현으로 통합(Task 18).
// soft-delete 성공 시 toast.show({ message, action:{ label:'되돌리기', onClick: restore(version+1) } })를 띄운다.
// 충돌(0행) → onConflict()만(토스트 없음; LWW 무음 덮어쓰기 금지 §4.3). 오프라인이면 ${table}.delete/${table}.restore로 큐잉
// (usePlaceTrash 가드 패턴 재사용). 메시지 미지정 시 kind 라벨 기반 기본('${label}을 삭제했어요').
export function useSoftDeleteWithUndo(
  kind: TrashKind,
  coupleId: string | null,
  myId: string | null,
  onConflict: () => void,
) {
  const queryClient = useQueryClient()
  const { enqueue } = useOfflineQueue()
  const toast = useToast()
  const table = TRASH_KINDS[kind].table

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: [table, coupleId] })
    void queryClient.invalidateQueries({ queryKey: ['trash', kind, coupleId] })
  }

  const mutation = useMutation<void, Error, { id: string; expectedVersion: number; message?: string }>({
    mutationFn: async ({ id, expectedVersion }) => {
      if (!myId) throw new Error('로그인이 필요해요.')
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await enqueue(`${table}.delete`, { id, expectedVersion, myId }, `${table}.delete:${id}`)
        return
      }
      const res = await softDelete(table, id, expectedVersion, myId)
      if (res.status === 'conflict') throw new ConflictError()
    },
    onSuccess: (_data, { id, expectedVersion, message }) => {
      // 되돌리기는 삭제로 +1된 버전(expectedVersion+1)으로 복구(낙관적 락, §4.3).
      toast.show(
        {
          message: message ?? `${TRASH_KINDS[kind].label}을 삭제했어요`,
          action: {
            label: '되돌리기',
            onClick: () => {
              void (async () => {
                if (!myId) return
                if (typeof navigator !== 'undefined' && !navigator.onLine) {
                  await enqueue(
                    `${table}.restore`,
                    { id, expectedVersion: expectedVersion + 1, myId },
                    `${table}.restore:${id}`,
                  )
                } else {
                  await restore(table, id, expectedVersion + 1, myId)
                }
                invalidate()
              })()
            },
          },
        },
        6000,
      )
    },
    onError: (err) => {
      if (err instanceof ConflictError) onConflict()
    },
    onSettled: invalidate,
  })

  // 충돌은 onError에서 onConflict()로 이미 처리하므로 호출 측엔 reject를 전파하지 않는다(useUnmarkVisited와 동형).
  const deleteWithUndo = (vars: { id: string; expectedVersion: number; message?: string }): Promise<void> =>
    mutation.mutateAsync(vars).catch((err: unknown) => {
      if (err instanceof ConflictError) return
      throw err
    })

  return { deleteWithUndo, isPending: mutation.isPending }
}
