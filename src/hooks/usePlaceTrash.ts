import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { softDelete, restore, ConflictError } from '@/lib/sync/versionedUpdate'
import { useOfflineQueue } from '@/state/OfflineQueueProvider'

// 휴지통(D3) — soft-delete된 장소 조회 + 삭제/복구. 물리삭제 금지(§4.3), 둘 다 복구 가능("상대가 지운 추억"도).
// 복구 경로(deleted_at IS NOT NULL 행 조회·update)는 0010_trash_rls.sql 적용 후에만 라이브 동작.

export type TrashPlaceRow = {
  id: string
  name: string
  address: string | null
  region_label: string | null
  deleted_at: string
  version: number
}

// 삭제된 장소 목록(deleted_at IS NOT NULL). 키는 ['placesTrash', coupleId].
export function useTrashPlaces(coupleId: string | null, enabled: boolean) {
  return useQuery<TrashPlaceRow[]>({
    queryKey: ['placesTrash', coupleId],
    enabled: Boolean(coupleId && isSupabaseConfigured) && enabled,
    queryFn: async () => {
      if (!coupleId) return []
      const { data, error } = await supabase
        .from('places')
        .select('id, name, address, region_label, deleted_at, version')
        .eq('couple_id', coupleId)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as TrashPlaceRow[]
    },
  })
}

// 장소를 휴지통으로(soft-delete). 낙관적 락 — 충돌 시 onConflict.
export function useDeletePlace(coupleId: string | null, myId: string | null, onConflict: () => void) {
  const queryClient = useQueryClient()
  const { enqueue } = useOfflineQueue()
  const mutation = useMutation<void, Error, { id: string; expectedVersion: number }>({
    mutationFn: async ({ id, expectedVersion }) => {
      if (!myId) throw new Error('로그인이 필요해요.')
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await enqueue('place.delete', { id, expectedVersion, myId }, `place.delete:${id}`)
        return
      }
      const res = await softDelete('places', id, expectedVersion, myId)
      if (res.status === 'conflict') throw new ConflictError()
    },
    onError: (err) => {
      if (err instanceof ConflictError) onConflict()
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['places', coupleId] })
      void queryClient.invalidateQueries({ queryKey: ['placesTrash', coupleId] })
    },
  })
  return { deletePlace: mutation.mutate, isPending: mutation.isPending }
}

// 휴지통에서 복구(restore). 낙관적 락 — 충돌 시 onConflict.
export function useRestorePlace(coupleId: string | null, myId: string | null, onConflict: () => void) {
  const queryClient = useQueryClient()
  const { enqueue } = useOfflineQueue()
  const mutation = useMutation<void, Error, { id: string; expectedVersion: number }>({
    mutationFn: async ({ id, expectedVersion }) => {
      if (!myId) throw new Error('로그인이 필요해요.')
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await enqueue('place.restore', { id, expectedVersion, myId }, `place.restore:${id}`)
        return
      }
      const res = await restore('places', id, expectedVersion, myId)
      if (res.status === 'conflict') throw new ConflictError()
    },
    onError: (err) => {
      if (err instanceof ConflictError) onConflict()
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['places', coupleId] })
      void queryClient.invalidateQueries({ queryKey: ['placesTrash', coupleId] })
    },
  })
  return { restorePlace: mutation.mutate, isPending: mutation.isPending }
}
