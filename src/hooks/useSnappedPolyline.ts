import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { RecapVertex } from '@/lib/recap/recapStats'
import {
  toLegs,
  verticesKey,
  mergeLegPolylines,
  roadDistanceKm,
  type LatLng,
  type LegResult,
} from '@/lib/recap/legs'

export type Snapped = {
  polyline: LatLng[] | null
  roadDistanceKm: number | null
  degraded: boolean
  isLoading: boolean
}

// 도로 스냅 폴리라인(프로그레시브 인핸스먼트) — directions 프록시에 인접 leg를 보내 도로 경로를 받는다.
// 미배포/실패/오프라인이면 polyline=null → 호출측(RecapPage)이 측지선 베이스라인 유지(안 죽음).
export function useSnappedPolyline(
  coupleId: string | null,
  tripId: string | null | undefined,
  vertices: RecapVertex[],
): Snapped {
  const legs = toLegs(vertices)
  const key = verticesKey(vertices)
  const q = useQuery<LegResult[]>({
    queryKey: ['trip-directions', coupleId, tripId, key],
    enabled: Boolean(coupleId && tripId && isSupabaseConfigured && legs.length >= 1),
    staleTime: 1000 * 60 * 60, // 동선은 visit 변경 전 불변(verticesKey가 바뀌면 새 쿼리)
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

  if (!q.data) {
    return { polyline: null, roadDistanceKm: null, degraded: false, isLoading: q.isLoading }
  }
  return {
    polyline: mergeLegPolylines(legs, q.data),
    roadDistanceKm: roadDistanceKm(q.data),
    degraded: q.data.some((r) => r.degraded),
    isLoading: q.isLoading,
  }
}
