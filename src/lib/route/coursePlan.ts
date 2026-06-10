// "함께 캘린더에 추가"용 코스 플랜(§5.6/§4.2) — AI 없이도 동작하는 결정론 동선.
// nearestNeighborOrder(거리순) + recomputeArrivals(도착시각 재계산)로 stop별 시각을 만든다. 순수 함수.
import { nearestNeighborOrder, type GeoPlace } from './fallbackTsp'
import { recomputeArrivals, minutesToHHmm } from './recompute'

export type CoursePlace = GeoPlace & { name: string }
export type CourseStop = { placeId: string; title: string; start: string; end: string }

/**
 * 거리순 + 체류/이동 기본값으로 하루 코스 stop들을 만든다(Asia/Seoul 고정 오프셋 ISO).
 * 자정 넘김 방지를 위해 호출부가 장소 수를 적당히 제한할 것(예: ≤6).
 */
export function buildCoursePlan(
  places: CoursePlace[],
  dateKey: string,
  opts?: { startMin?: number; stayMin?: number; legMin?: number },
): CourseStop[] {
  const startMin = opts?.startMin ?? 600 // 10:00
  const stayMin = opts?.stayMin ?? 90
  const legMin = opts?.legMin ?? 30

  const order = nearestNeighborOrder(places)
  const byId = new Map(places.map((p) => [p.id, p]))
  const legStops = order.map((_, i) => ({ stayMin, legMinToHere: i === 0 ? 0 : legMin }))
  const arrivals = recomputeArrivals(startMin, legStops)

  return order.map((id, i) => {
    const arr = arrivals[i]!
    const place = byId.get(id)!
    return {
      placeId: id,
      title: place.name,
      // EventSheet와 동일하게 UTC ISO로 정규화(Asia/Seoul 고정 오프셋).
      start: new Date(`${dateKey}T${minutesToHHmm(arr)}:00+09:00`).toISOString(),
      end: new Date(`${dateKey}T${minutesToHHmm(arr + stayMin)}:00+09:00`).toISOString(),
    }
  })
}
