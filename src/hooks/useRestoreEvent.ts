import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useOfflineQueue } from '@/state/OfflineQueueProvider'
import { restore, ConflictError } from '@/lib/sync/versionedUpdate'

// 일정(events) 휴지통 복구(R1.5) — useRestorePlace를 일반화한 restore('events', id, expectedVersion, myId).
// 0행 반환(서버 version↑) = 충돌 → onConflict(LWW 무음 덮어쓰기 금지, §4.3). 오프라인이면 event.restore로 큐잉.
// 복구 경로(deleted_at IS NOT NULL 행 update)는 events trash-RLS(0010/0012) 적용 후에만 라이브 동작.
export function useRestoreEvent(coupleId: string | null, myId: string | null, onConflict: () => void) {
  const queryClient = useQueryClient()
  const { enqueue } = useOfflineQueue()
  const mutation = useMutation<void, Error, { id: string; expectedVersion: number }>({
    mutationFn: async ({ id, expectedVersion }) => {
      if (!myId) throw new Error('로그인이 필요해요.')
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await enqueue('event.restore', { id, expectedVersion, myId }, `event.restore:${id}`)
        return
      }
      const res = await restore('events', id, expectedVersion, myId)
      if (res.status === 'conflict') throw new ConflictError()
    },
    onError: (err) => {
      if (err instanceof ConflictError) onConflict()
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', coupleId] })
    },
  })
  return { restoreEvent: mutation.mutate, isPending: mutation.isPending }
}
