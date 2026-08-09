import { boundsOf, type Bounds } from './yearMap'
import type { LatLng } from './sharePath'
import type { YearStop } from './yearMap'

// 전국 지도에서 여행 하나를 골라 볼 때 필요한 것 — 그 여행의 스톱과 경계(순수).
//
// 전국 지도는 '어디에 갔는가'를 보여주고, 여행을 고르면 '그날 어떻게 다녔는가'로 내려간다.
// 두 층이 같은 데이터(방문 기록)에서 나오므로 어긋날 수 없다(§7 상태는 도출).

export type TripStops = {
  tripId: string
  title: string
  startDate: string
  endDate: string
  /** 방문 순서(날짜) 대로. 같은 날이면 원래 순서. */
  stops: LatLng[]
  /** 이 여행만 보여줄 때 쓸 지도 경계. */
  bounds: Bounds
  stopCount: number
}

export type TripLike = { id: string; title: string; start_date: string; end_date: string }

/**
 * 여행 × 방문 → 여행별 스톱.
 *
 * 스톱이 없는 여행은 목록에 넣지 않는다 — 눌러도 빈 지도가 나오는 항목은 UI가 아니라 잡음이다.
 * 최근 여행이 앞에 온다(방금 다녀온 것을 먼저 보고 싶다).
 */
export function buildTripStops(
  trips: readonly TripLike[],
  stops: readonly (YearStop & { tripId: string | null })[],
): TripStops[] {
  const byTrip = new Map<string, (YearStop & { tripId: string | null })[]>()
  for (const s of stops) {
    if (!s.tripId) continue
    const list = byTrip.get(s.tripId)
    if (list) list.push(s)
    else byTrip.set(s.tripId, [s])
  }

  const out: TripStops[] = []
  for (const t of trips) {
    const raw = byTrip.get(t.id)
    if (!raw || raw.length === 0) continue
    const seen = new Set<string>()
    const ordered = raw
      .map((s, i) => ({ s, i }))
      .sort((a, b) => {
        const da = a.s.date ?? ''
        const db = b.s.date ?? ''
        return da < db ? -1 : da > db ? 1 : a.i - b.i
      })
      .filter(({ s }) => {
        if (seen.has(s.placeId)) return false
        seen.add(s.placeId)
        return true
      })
      .map(({ s }) => ({ lat: s.lat, lng: s.lng }))
    if (ordered.length === 0) continue
    out.push({
      tripId: t.id,
      title: t.title,
      startDate: t.start_date,
      endDate: t.end_date,
      stops: ordered,
      bounds: boundsOf(ordered),
      stopCount: ordered.length,
    })
  }
  return out.sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0))
}

/**
 * 화면 좌표에서 가장 가까운 스톱의 여행 — 캔버스 탭을 여행 선택으로 바꾼다.
 *
 * 반경 밖이면 null이다(빈 곳을 눌렀는데 엉뚱한 여행이 열리면 더 나쁘다).
 * 겹친 점은 **가장 최근 여행**이 이긴다 — 같은 카페를 두 번 갔으면 최근 기억이 우선이다.
 */
export function tripAtPoint(
  trips: readonly TripStops[],
  point: { x: number; y: number },
  project: (p: LatLng) => { x: number; y: number },
  radiusPx = 28,
): TripStops | null {
  let best: { trip: TripStops; d: number } | null = null
  for (const t of trips) {
    for (const s of t.stops) {
      const q = project(s)
      const d = Math.hypot(q.x - point.x, q.y - point.y)
      if (d <= radiusPx && (!best || d < best.d)) best = { trip: t, d }
    }
  }
  return best?.trip ?? null
}
