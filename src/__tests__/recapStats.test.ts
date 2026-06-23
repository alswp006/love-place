import { describe, it, expect } from 'vitest'
import { haversineKm, orderedVertices, recapStats } from '@/lib/recap/recapStats'

const place = (id: string, lat: number | null, lng: number | null, name = id, region: string | null = null) => ({
  id,
  name,
  lat,
  lng,
  region_label: region,
})
const visit = (id: string, place_id: string, visit_date: string | null, trip_id = 't1') => ({
  id,
  place_id,
  trip_id,
  visit_date,
})

describe('haversineKm', () => {
  it('같은 점은 0', () => {
    expect(haversineKm({ lat: 37, lng: 127 }, { lat: 37, lng: 127 })).toBe(0)
  })
  it('위도 1도 ≈ 111km', () => {
    const d = haversineKm({ lat: 37, lng: 127 }, { lat: 38, lng: 127 })
    expect(d).toBeGreaterThan(110)
    expect(d).toBeLessThan(112)
  })
})

describe('orderedVertices', () => {
  const byId = {
    p1: place('p1', 37.0, 127.0, '첫집', '서울'),
    p2: place('p2', 38.0, 128.0, '둘째', '속초'),
    p3: place('p3', null, null, '좌표없음'), // 제외 대상
  }
  it('visit_date 오름차 정렬 + 좌표 없는 장소 제외', () => {
    const v = orderedVertices(
      [visit('v2', 'p2', '2026-05-02'), visit('v1', 'p1', '2026-05-01'), visit('v3', 'p3', '2026-05-03')],
      byId,
    )
    expect(v.map((x) => x.visitId)).toEqual(['v1', 'v2']) // p3 제외, 날짜순
    expect(v[0]!.name).toBe('첫집')
  })
  it('날짜 동률은 visitId로 안정 정렬', () => {
    const v = orderedVertices(
      [visit('vB', 'p2', '2026-05-01'), visit('vA', 'p1', '2026-05-01')],
      byId,
    )
    expect(v.map((x) => x.visitId)).toEqual(['vA', 'vB'])
  })
  it('place 누락 visit은 제외', () => {
    expect(orderedVertices([visit('v9', 'pX', '2026-05-01')], byId)).toEqual([])
  })
})

describe('recapStats', () => {
  const byId = { p1: place('p1', 37.0, 127.0), p2: place('p2', 38.0, 127.0) }
  it('장소 수·거리 합·기간(양끝 포함)', () => {
    const v = orderedVertices([visit('v1', 'p1', '2026-05-01'), visit('v2', 'p2', '2026-05-02')], byId)
    const s = recapStats(v, { start_date: '2026-05-01', end_date: '2026-05-03' })
    expect(s.stopCount).toBe(2)
    expect(s.distanceKm).toBeGreaterThan(110) // 위도 1도
    expect(s.distanceKm).toBeLessThan(112)
    expect(s.days).toBe(3) // 1~3일 = 3일
  })
  it('trip 없으면 days=0, 정점 0이면 거리 0', () => {
    expect(recapStats([], null)).toEqual({ stopCount: 0, distanceKm: 0, days: 0 })
  })
})
