import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { dayKey } from '@/lib/calendar/eventDays'
import { softDelete } from '@/lib/sync/versionedUpdate'
import { useOfflineQueue } from '@/state/OfflineQueueProvider'

// 방문(가봤음) — "상태 플래그가 아니라 기록 추가"(§5.3·CLAUDE.md §7). 같은 장소 재방문은 각각 행.
// "가봤음 = visits 존재"로 도출(마커 채운 별). 키 ['visits', coupleId], realtime 전파.
export type VisitRow = {
  id: string
  place_id: string
  trip_id: string | null
  visit_date: string | null
  rating: number | null
  memo: string | null
  version: number
}

export function useVisits(coupleId: string | null) {
  const queryClient = useQueryClient()

  const query = useQuery<VisitRow[]>({
    queryKey: ['visits', coupleId],
    enabled: Boolean(coupleId && isSupabaseConfigured),
    queryFn: async () => {
      if (!coupleId) return []
      const { data, error } = await supabase
        .from('visits')
        .select('id, place_id, trip_id, visit_date, rating, memo, version')
        .eq('couple_id', coupleId)
        .is('deleted_at', null)
        .order('visit_date', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as VisitRow[]
    },
  })

  useEffect(() => {
    if (!coupleId || !isSupabaseConfigured) return
    const channel = supabase
      .channel(`visits:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'visits', filter: `couple_id=eq.${coupleId}` },
        () => queryClient.invalidateQueries({ queryKey: ['visits', coupleId] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, queryClient])

  return query
}

// "다녀왔어요" — 방문 기록 추가(insert). 마커가 가봤음으로 도출 전환(§5.3).
// alreadyVisited면 no-op — 더블탭/중복 호출로 같은 장소 방문행이 또 생기는 것을 막는다(spec §3.4).
export function useMarkVisited(coupleId: string | null, myId: string | null) {
  const queryClient = useQueryClient()
  const { enqueue } = useOfflineQueue()
  return useMutation<void, Error, { placeId: string; visitDate?: string; alreadyVisited?: boolean }>({
    mutationFn: async ({ placeId, visitDate, alreadyVisited }) => {
      if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
      if (alreadyVisited) return // 중복 방문 insert 방지(spec §3.4)
      // 오프라인: 큐에 적재 → 재연결 시 동기화(D2, "여행 중 기록 유실" 방지). dedupeKey로 같은 장소 1건.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await enqueue(
          'visit.add',
          { coupleId, placeId, visitDate: visitDate ?? dayKey(new Date().toISOString()), myId },
          `visit.add:${placeId}`,
        )
        return
      }
      const { error } = await supabase.from('visits').insert({
        couple_id: coupleId,
        place_id: placeId,
        visit_date: visitDate ?? dayKey(new Date().toISOString()),
        created_by: myId,
        updated_by: myId,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['visits', coupleId] })
    },
  })
}

// "가봤음 취소"(토글) — 해당 place의 활성 방문행(들)을 soft-delete(deleted_at). 낙관적 락(§4.3):
// version 조건부 softDelete가 0행이면 충돌 → onConflict(무음 덮어쓰기 금지). 여러 행이면 모두 처리해야
// "가봤음"(visits 존재) 도출이 해제된다. realtime visits:${coupleId}가 양측에 전파.
// stale-cache race 회피로 mutationFn에서 살아있는 행을 직접 재조회(useReactions 패턴) → {status}를 돌려줘
// 호출 측이 removed/noop/conflict별로 다른 토스트를 띄우게 한다(무동작 성공 제거, R1.2). 방문은 공유라 user_id 필터 없음.
export function useUnmarkVisited(
  coupleId: string | null,
  myId: string | null,
  onConflict: () => void,
) {
  const queryClient = useQueryClient()
  const { enqueue } = useOfflineQueue()
  return useMutation<
    { status: 'removed' | 'noop' | 'conflict' },
    Error,
    { placeId: string },
    { prev: VisitRow[] | undefined }
  >({
    mutationFn: async ({ placeId }) => {
      if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
      // 오프라인: 살아있는 행을 재조회할 수 없으므로 placeId+coupleId만 큐잉(재연결 시 flush가 재조회).
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await enqueue('visit.remove', { placeId, myId, coupleId }, `visit.remove:${placeId}`)
        return { status: 'removed' }
      }
      // stale-cache race 회피 — mutationFn에서 살아있는 방문행을 직접 조회(id+version).
      const { data: live, error: selErr } = await supabase
        .from('visits')
        .select('id, version')
        .eq('couple_id', coupleId)
        .eq('place_id', placeId)
        .is('deleted_at', null)
      if (selErr) throw new Error(selErr.message)
      const rows = (live ?? []) as { id: string; version: number }[]
      if (rows.length === 0) return { status: 'noop' }
      let conflicted = false
      for (const r of rows) {
        const res = await softDelete('visits', r.id, r.version, myId)
        if (res.status === 'conflict') conflicted = true
      }
      if (conflicted) {
        onConflict()
        return { status: 'conflict' }
      }
      return { status: 'removed' }
    },
    // 낙관적 마커 토글(spec R1.2): 캐시에서 해당 place의 활성 방문행을 즉시 제거 → 마커가 '가고싶음'으로.
    onMutate: async ({ placeId }) => {
      await queryClient.cancelQueries({ queryKey: ['visits', coupleId] })
      const prev = queryClient.getQueryData<VisitRow[]>(['visits', coupleId])
      queryClient.setQueryData<VisitRow[]>(
        ['visits', coupleId],
        (old) => (old ?? []).filter((v) => v.place_id !== placeId),
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      // 롤백: 스냅샷 복원(무음 덮어쓰기 금지).
      if (ctx?.prev !== undefined) queryClient.setQueryData(['visits', coupleId], ctx.prev)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['visits', coupleId] })
    },
  })
}
