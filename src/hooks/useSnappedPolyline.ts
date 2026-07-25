import type { RecapVertex } from '@/lib/recap/recapStats'
import { useDirectionLegs } from '@/hooks/useDirectionLegs'
import {
  toLegs,
  verticesKey,
  mergeLegPolylines,
  roadDistanceKm,
  type LatLng,
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
  // 동선은 visit 변경 전 불변(verticesKey가 바뀌면 새 쿼리).
  const q = useDirectionLegs(coupleId, tripId, legs, verticesKey(vertices))

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
