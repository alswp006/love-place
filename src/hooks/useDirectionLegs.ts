import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { Leg, LegResult } from '@/lib/recap/legs'

// directions 프록시 호출의 단일 경로(리캡 동선·여행 Day 구간이 공유).
// 인접 leg만 보내 provider 경유지 상한을 우회하고, 서버는 leg별 24h 캐시로 사실상 무료 구간을 만든다.
// 미배포/실패/오프라인이면 data=undefined → 호출측이 각자 폴백(측지선 유지 / 칩 숨김). 앱은 안 죽는다.
export function useDirectionLegs(
  coupleId: string | null,
  scope: string | null | undefined,
  legs: Leg[],
  cacheKey: string,
) {
  return useQuery<LegResult[]>({
    queryKey: ['directions', coupleId, scope, cacheKey],
    enabled: Boolean(coupleId && scope && isSupabaseConfigured && legs.length >= 1),
    staleTime: 1000 * 60 * 60, // 같은 구간 집합은 한 시간 동안 재요청하지 않음(비용 가드)
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ ok: boolean; legs: LegResult[] }>(
        'directions',
        { body: { legs } },
      )
      if (error || !data || data.ok === false) throw new Error('directions unavailable')
      return data.legs
    },
  })
}
