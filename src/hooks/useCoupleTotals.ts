import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'

// 우리가 지금까지 **함께 걸어온 거리** — 공유 카드의 핵심 숫자.
//
// 왜 이게 중요한가: 오늘 3km는 자랑거리가 못 된다. 러닝 앱이 통하는 이유는 숫자가 노력을
// 증명하기 때문인데, 커플판 등가물은 하루치가 아니라 **누적**이다. "428일 · 312km"는
// 하루아침에 못 만들고, 그래서 관계의 깊이를 대신 말한다.
//
// 세션 종료 시 recorded_distance_m가 채워진다(설계 T8) — 그 합이 곧 누적이다.
// 진행 중 세션은 아직 거리가 없으므로 자연히 빠진다(끝나야 우리 기록이 된다).
export function useCoupleTotalKm(coupleId: string | null) {
  return useQuery<number>({
    queryKey: ['couple-total-km', coupleId],
    enabled: Boolean(coupleId && isSupabaseConfigured),
    // 자주 바뀌지 않는다(여행이 끝날 때만) — 길게 캐시해 카드 열 때마다 훑지 않는다.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!coupleId) return 0
      const { data, error } = await supabase
        .from('trip_sessions')
        .select('recorded_distance_m')
        .eq('couple_id', coupleId)
        .is('deleted_at', null)
      if (error) throw new Error(error.message)
      const meters = (data ?? []).reduce((sum, r) => {
        const m = (r as { recorded_distance_m: number | null }).recorded_distance_m
        return sum + (typeof m === 'number' && Number.isFinite(m) && m > 0 ? m : 0)
      }, 0)
      return meters / 1000
    },
  })
}
