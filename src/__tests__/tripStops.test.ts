import { describe, it, expect } from 'vitest'
import { buildTripStops, tripAtPoint, type TripLike } from '@/lib/recap/tripStops'
import { projectWith } from '@/lib/recap/yearMap'
import { KOREA_BOUNDS } from '@/lib/recap/koreaOutline'
import type { YearStop } from '@/lib/recap/yearMap'

// 전국 지도의 두 층: '어디에 갔나'(점) → 누르면 '그날 어떻게 다녔나'(동선).
// 두 층이 같은 방문 기록에서 나오므로 어긋날 수 없다(§7 상태는 도출, 저장 아님).

const trip = (id: string, title: string, start: string, end = start): TripLike => ({
  id,
  title,
  start_date: start,
  end_date: end,
})

const stop = (
  placeId: string,
  lat: number,
  lng: number,
  date: string | null,
  tripId: string | null,
): YearStop & { tripId: string | null } => ({ placeId, lat, lng, date, regionLabel: null, tripId })

describe('buildTripStops', () => {
  it('여행별로 스톱을 모으고 날짜순으로 잇는다', () => {
    const out = buildTripStops(
      [trip('t1', '속초', '2026-03-01', '2026-03-02')],
      [
        stop('b', 38.21, 128.60, '2026-03-02', 't1'),
        stop('a', 38.20, 128.59, '2026-03-01', 't1'),
      ],
    )
    expect(out).toHaveLength(1)
    expect(out[0]!.stops.map((s) => s.lat)).toEqual([38.2, 38.21])
    expect(out[0]!.stopCount).toBe(2)
  })

  it('스톱이 없는 여행은 목록에서 뺀다 — 눌러도 빈 지도가 나오는 항목은 잡음이다', () => {
    const out = buildTripStops(
      [trip('t1', '계획만 한 여행', '2026-06-01'), trip('t2', '다녀온 여행', '2026-05-01')],
      [stop('a', 35.1, 129.0, '2026-05-01', 't2')],
    )
    expect(out.map((t) => t.tripId)).toEqual(['t2'])
  })

  it('여행에 안 묶인 방문은 여행 목록에 안 들어간다(전국 지도에는 남는다)', () => {
    const out = buildTripStops([trip('t1', 'x', '2026-01-01')], [stop('a', 37, 127, '2026-01-01', null)])
    expect(out).toEqual([])
  })

  it('같은 장소를 두 번 갔어도 그 여행의 스톱은 하나다', () => {
    const out = buildTripStops(
      [trip('t1', 'x', '2026-03-01')],
      [stop('a', 38.2, 128.59, '2026-03-01', 't1'), stop('a', 38.2, 128.59, '2026-03-02', 't1')],
    )
    expect(out[0]!.stopCount).toBe(1)
  })

  it('최근 여행이 앞에 온다 — 방금 다녀온 것을 먼저 보고 싶다', () => {
    const out = buildTripStops(
      [trip('old', '작년', '2025-05-01'), trip('new', '이번달', '2026-08-01')],
      [stop('a', 37, 127, '2025-05-01', 'old'), stop('b', 35, 129, '2026-08-01', 'new')],
    )
    expect(out.map((t) => t.tripId)).toEqual(['new', 'old'])
  })

  it('한 곳만 다녀온 여행도 경계가 생긴다 — 0으로 나눠 배율이 무한대가 되지 않게', () => {
    const out = buildTripStops([trip('t1', 'x', '2026-03-01')], [stop('a', 38.2, 128.59, '2026-03-01', 't1')])
    const b = out[0]!.bounds
    expect(b.maxLat - b.minLat).toBeGreaterThan(0)
    expect(b.maxLng - b.minLng).toBeGreaterThan(0)
    expect(Number.isFinite(b.minLat)).toBe(true)
  })
})

describe('tripAtPoint — 지도를 눌러 여행으로', () => {
  const box = { x: 0, y: 0, w: 560, h: 1020 }
  const project = (p: { lat: number; lng: number }) => projectWith(p, KOREA_BOUNDS, box)
  const trips = buildTripStops(
    [trip('sokcho', '속초', '2026-03-01'), trip('busan', '부산', '2026-05-01')],
    [
      stop('a', 38.2, 128.59, '2026-03-01', 'sokcho'),
      stop('b', 35.09, 129.03, '2026-05-01', 'busan'),
    ],
  )

  it('점 위를 누르면 그 여행이 잡힌다', () => {
    const p = project({ lat: 38.2, lng: 128.59 })
    expect(tripAtPoint(trips, p, project)?.tripId).toBe('sokcho')
  })

  it('다른 점을 누르면 다른 여행', () => {
    const p = project({ lat: 35.09, lng: 129.03 })
    expect(tripAtPoint(trips, p, project)?.tripId).toBe('busan')
  })

  it('빈 곳을 누르면 아무 일도 없다 — 엉뚱한 여행이 열리는 게 더 나쁘다', () => {
    const p = project({ lat: 36.5, lng: 126.3 }) // 서해 한가운데
    expect(tripAtPoint(trips, p, project)).toBeNull()
  })

  it('반경 밖이면 null(반경을 좁히면 같은 자리도 안 잡힌다)', () => {
    const p = project({ lat: 38.2, lng: 128.59 })
    expect(tripAtPoint(trips, { x: p.x + 60, y: p.y }, project)).toBeNull()
    expect(tripAtPoint(trips, { x: p.x + 60, y: p.y }, project, 80)?.tripId).toBe('sokcho')
  })

  it('겹친 점은 가장 가까운 것이 이긴다', () => {
    const near = buildTripStops(
      [trip('t1', 'A', '2026-01-01'), trip('t2', 'B', '2026-02-01')],
      [stop('a', 37.5, 127.0, '2026-01-01', 't1'), stop('b', 37.52, 127.0, '2026-02-01', 't2')],
    )
    const p = project({ lat: 37.5, lng: 127.0 })
    expect(tripAtPoint(near, p, project)?.title).toBe('A')
  })
})
