import { describe, it, expect } from 'vitest'
import { clusterMemberPts, boundsSpanTiny } from '@/lib/places/clusterBounds'
import type { ClusterPoint } from '@/lib/places/clusterPlaces'

const A: ClusterPoint = { id: 'a', lat: 37.5, lng: 127.0 }
const B: ClusterPoint = { id: 'b', lat: 37.6, lng: 127.1 } // A와 멀리(0.1° 스팬)
const NEAR: ClusterPoint = { id: 'n', lat: 37.50001, lng: 127.00001 } // A와 ~1m(근접)
const OTHER: ClusterPoint = { id: 'x', lat: 35.0, lng: 129.0 } // 멤버 밖

describe('clusterMemberPts (멤버 좌표 도출)', () => {
  it('ids에 든 점만 반환한다', () => {
    const out = clusterMemberPts(['a', 'b'], [A, B, OTHER])
    expect(out).toEqual([A, B])
  })

  it('ids에 없는 점은 제외(멤버 밖 OTHER 제거)', () => {
    const out = clusterMemberPts(['a'], [A, B, OTHER])
    expect(out).toEqual([A])
  })

  it('빈 ids → 빈 배열', () => {
    expect(clusterMemberPts([], [A, B])).toEqual([])
  })
})

describe('boundsSpanTiny (degenerate 가드)', () => {
  it('빈 멤버는 degenerate(true)로 처리(폴백 안전)', () => {
    expect(boundsSpanTiny([])).toBe(true)
  })

  it('충분히 떨어진 멤버는 false(정상 fitBounds 분기)', () => {
    expect(boundsSpanTiny([A, B])).toBe(false)
  })

  it('동일/근접 좌표(스팬 < minDeg)는 true', () => {
    expect(boundsSpanTiny([A, NEAR])).toBe(true)
  })

  it('단일 멤버(스팬 0)는 true', () => {
    expect(boundsSpanTiny([A])).toBe(true)
  })

  it('minDeg 임계값을 존중한다(lat·lng 둘 다 미만이어야 tiny)', () => {
    // lat 스팬 0.1° (>= 큰 minDeg), lng 스팬 0 → lng는 tiny지만 lat은 아님 → false
    const sameLng: ClusterPoint = { id: 's', lat: 37.6, lng: 127.0 }
    expect(boundsSpanTiny([A, sameLng], 0.0005)).toBe(false)
  })
})
