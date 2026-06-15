import { describe, it, expect } from 'vitest'
import { clusterPlaces, type ClusterPoint } from '@/lib/places/clusterPlaces'

const A: ClusterPoint = { id: 'a', lat: 37.5000, lng: 127.0000 }
const B: ClusterPoint = { id: 'b', lat: 37.5001, lng: 127.0001 } // A와 ~14m(낮은/중간 줌에선 같은 셀)
const FAR: ClusterPoint = { id: 'c', lat: 38.5, lng: 128.5 }

describe('clusterPlaces (순수 그리드 클러스터러)', () => {
  it('빈 입력은 빈 배열', () => {
    expect(clusterPlaces([], 12)).toEqual([])
  })

  it('낮은 줌(셀 큼)에서 가까운 두 점은 한 클러스터로 묶이고 count=2', () => {
    const out = clusterPlaces([A, B], 6)
    const clusters = out.filter((c) => c.kind === 'cluster')
    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.count).toBe(2)
    expect(new Set(clusters[0]!.ids)).toEqual(new Set(['a', 'b']))
  })

  it('멀리 떨어진 점은 단일(single)로 남는다', () => {
    const out = clusterPlaces([A, FAR], 6)
    const singles = out.filter((c) => c.kind === 'single')
    expect(singles).toHaveLength(2)
  })

  it('아주 높은 줌(셀 매우 작음)에서는 가까운 두 점도 각각 단일', () => {
    // zoom 20: cellSizeDeg = 1.0/2^(20-6) ≈ 6.10e-5° (~6.8m) < A·B 분리(~14m) → 서로 다른 셀.
    // (주의: zoom 18은 cell ~27m로 A·B가 같은 셀에 묶이므로 단일 분리를 검증하지 못한다.)
    const out = clusterPlaces([A, B], 20)
    expect(out.every((c) => c.kind === 'single')).toBe(true)
    expect(out).toHaveLength(2)
  })

  it('클러스터 좌표는 멤버 평균(centroid)', () => {
    const out = clusterPlaces([A, B], 6)
    const cl = out.find((c) => c.kind === 'cluster')!
    expect(cl.lat).toBeCloseTo((A.lat + B.lat) / 2, 6)
    expect(cl.lng).toBeCloseTo((A.lng + B.lng) / 2, 6)
  })
})
