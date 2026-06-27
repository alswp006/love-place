import { describe, it, expect } from 'vitest'
import { orderedRoute, recordedDistanceKm, type RoutePointLike } from '@/lib/recap/routeStats'

describe('routeStats', () => {
  it('recordedDistanceKm: 0~1점은 0, 연속 점은 haversine 누적', () => {
    expect(recordedDistanceKm([])).toBe(0)
    expect(recordedDistanceKm([{ lat: 37.5, lng: 127 }])).toBe(0)
    // 서울 시청 → 약 1.11km 북쪽(0.01도 위도)
    const d = recordedDistanceKm([
      { lat: 37.5, lng: 127.0 },
      { lat: 37.51, lng: 127.0 },
    ])
    expect(d).toBeGreaterThan(1.0)
    expect(d).toBeLessThan(1.3)
  })

  it('orderedRoute: recorded_at 오름차 정렬', () => {
    const pts: RoutePointLike[] = [
      { recorded_at: '2026-06-01T10:02:00Z', lat: 37.52, lng: 127, client_point_id: 'c' },
      { recorded_at: '2026-06-01T10:00:00Z', lat: 37.5, lng: 127, client_point_id: 'a' },
      { recorded_at: '2026-06-01T10:01:00Z', lat: 37.51, lng: 127, client_point_id: 'b' },
    ]
    const out = orderedRoute(pts)
    expect(out.map((p) => p.client_point_id)).toEqual(['a', 'b', 'c'])
  })

  it('orderedRoute: client_point_id 중복 제거(멱등)', () => {
    const pts: RoutePointLike[] = [
      { recorded_at: '2026-06-01T10:00:00Z', lat: 37.5, lng: 127, client_point_id: 'a' },
      { recorded_at: '2026-06-01T10:00:00Z', lat: 37.5, lng: 127, client_point_id: 'a' },
      { recorded_at: '2026-06-01T10:01:00Z', lat: 37.51, lng: 127, client_point_id: 'b' },
    ]
    expect(orderedRoute(pts)).toHaveLength(2)
  })

  it('orderedRoute: client_point_id 없으면 recorded_at+좌표로 디듑', () => {
    const pts: RoutePointLike[] = [
      { recorded_at: '2026-06-01T10:00:00Z', lat: 37.5, lng: 127 },
      { recorded_at: '2026-06-01T10:00:00Z', lat: 37.5, lng: 127 },
    ]
    expect(orderedRoute(pts)).toHaveLength(1)
  })
})
