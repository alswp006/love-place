import { describe, it, expect } from 'vitest'
import { toLegs, verticesKey, mergeLegPolylines, roadDistanceKm, type LegResult } from '@/lib/recap/legs'
import type { RecapVertex } from '@/lib/recap/recapStats'

const vtx = (id: string, lat: number, lng: number): RecapVertex => ({
  visitId: id,
  placeId: 'p' + id,
  name: id,
  lat,
  lng,
  visitDate: null,
  regionLabel: null,
})

describe('toLegs', () => {
  it('정점 3개 → 인접 leg 2개', () => {
    const legs = toLegs([vtx('a', 37, 127), vtx('b', 38, 127), vtx('c', 38, 128)])
    expect(legs).toHaveLength(2)
    expect(legs[0]).toEqual({ from: { lat: 37, lng: 127 }, to: { lat: 38, lng: 127 } })
  })
  it('정점 1개 → leg 0', () => {
    expect(toLegs([vtx('a', 37, 127)])).toEqual([])
  })
})

describe('verticesKey', () => {
  it('정점 추가/순서 변경 시 키가 달라진다', () => {
    const a = verticesKey([vtx('a', 37, 127), vtx('b', 38, 127)])
    expect(verticesKey([vtx('b', 38, 127), vtx('a', 37, 127)])).not.toBe(a) // 순서
    expect(verticesKey([vtx('a', 37, 127)])).not.toBe(a) // 삭제
  })
})

describe('mergeLegPolylines', () => {
  const legs = toLegs([vtx('a', 37, 127), vtx('b', 38, 128)])
  it('성공 leg의 폴리라인을 잇는다', () => {
    const r: LegResult[] = [
      { polyline: [{ lat: 37, lng: 127 }, { lat: 37.5, lng: 127.5 }, { lat: 38, lng: 128 }], distanceMeters: 1000, degraded: false },
    ]
    expect(mergeLegPolylines(legs, r)).toHaveLength(3)
  })
  it('degraded leg는 직선(from,to)으로 메운다', () => {
    const r: LegResult[] = [{ polyline: null, distanceMeters: null, degraded: true }]
    expect(mergeLegPolylines(legs, r)).toEqual([{ lat: 37, lng: 127 }, { lat: 38, lng: 128 }])
  })
})

describe('roadDistanceKm', () => {
  it('거리 합(km)', () => {
    expect(roadDistanceKm([{ polyline: [], distanceMeters: 1500, degraded: false }, { polyline: [], distanceMeters: 500, degraded: false }])).toBe(2)
  })
  it('하나라도 미상이면 null(→측지선 폴백)', () => {
    expect(roadDistanceKm([{ polyline: [], distanceMeters: 1500, degraded: false }, { polyline: null, distanceMeters: null, degraded: true }])).toBeNull()
  })
})
