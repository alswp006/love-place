import { useMutation, useQueryClient } from '@tanstack/react-query'
import { versionedUpdate, ConflictError } from '@/lib/sync/versionedUpdate'
import { useOfflineQueue } from '@/state/OfflineQueueProvider'

// 내 위시 우선순위(하트) 변경 — 낙관적 락(version 조건부, §4.3). 충돌이면 onConflict()로 알리고 서버 정본으로 새로고침.
// 오프라인이면 큐에 적재(D2) → 재연결 시 동기화.
export function useSetWishPriority(
  coupleId: string | null,
  myId: string | null,
  onConflict: () => void,
) {
  const queryClient = useQueryClient()
  const { enqueue } = useOfflineQueue()

  const mutation = useMutation<void, Error, { wishId: string; expectedVersion: number; priority: number }>({
    mutationFn: async ({ wishId, expectedVersion, priority }) => {
      if (!myId) throw new Error('로그인이 필요해요.')
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await enqueue('wish.setPriority', { wishId, expectedVersion, priority, myId }, `wish.setPriority:${wishId}`)
        return
      }
      const res = await versionedUpdate('wishes', wishId, expectedVersion, { priority, updated_by: myId })
      if (res.status === 'conflict') throw new ConflictError()
    },
    onError: (err) => {
      if (err instanceof ConflictError) onConflict()
    },
    // 성공이든 충돌이든 서버 정본으로 다시 맞춘다(LWW 금지 — 충돌 시 내 값이 덮어쓰지 않음).
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['wishes', coupleId] })
    },
  })

  return { setPriority: mutation.mutate, isPending: mutation.isPending }
}
