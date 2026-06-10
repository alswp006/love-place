import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/state/auth'
import { useOfflineQueue } from '@/state/OfflineQueueProvider'
import { savePlace, type SaveResult } from '@/lib/places/savePlace'
import type { KakaoPlaceHit } from '@/lib/kakao/types'

// 네이버 검색 결과를 저장(§5.2). 오프라인이면 큐에 적재 → 재연결 시 동기화(D2, "여행 중 저장 유실" 방지).
// 온라인 결과는 SaveResult, 오프라인 적재는 null(호출부가 "연결되면 저장" 안내).
export function useSavePlace(coupleId: string | null) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { enqueue } = useOfflineQueue()

  return useMutation<SaveResult | null, Error, KakaoPlaceHit>({
    mutationFn: async (hit) => {
      if (!coupleId || !user) throw new Error('먼저 상대와 연결해 주세요.')
      const uid = user.id

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await enqueue('place.save', { coupleId, hit, uid })
        return null // 오프라인: 큐 적재, 재연결 시 동기화
      }

      return savePlace(coupleId, hit, uid)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['places', coupleId] })
      queryClient.invalidateQueries({ queryKey: ['wishes', coupleId] })
    },
  })
}
