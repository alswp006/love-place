import { describe, it, expect } from 'vitest'
import { regionClusters } from '@/lib/recommend/regionClusters'

const P = (id: string, code: string | null, label: string | null) => ({ id, region_code: code, region_label: label })

describe('regionClusters', () => {
  it('region_code 기준 그룹핑 + count', () => {
    const clusters = regionClusters(
      [P('1', '51210', '속초'), P('2', '51210', '속초'), P('3', '11', '서울')],
      3,
    )
    const sokcho = clusters.find((c) => c.regionCode === '51210')
    expect(sokcho?.count).toBe(2)
    expect(sokcho?.placeIds).toEqual(['1', '2'])
  })

  it('임계치 충족 시 ready=true', () => {
    const clusters = regionClusters([P('1', 'a', 'A'), P('2', 'a', 'A'), P('3', 'a', 'A')], 3)
    expect(clusters[0]?.ready).toBe(true)
    const under = regionClusters([P('1', 'a', 'A'), P('2', 'a', 'A')], 3)
    expect(under[0]?.ready).toBe(false)
  })

  it('count 내림차순 정렬', () => {
    const clusters = regionClusters(
      [P('1', 'a', 'A'), P('2', 'b', 'B'), P('3', 'b', 'B'), P('4', 'b', 'B')],
      3,
    )
    expect(clusters.map((c) => c.regionLabel)).toEqual(['B', 'A'])
    expect(clusters[0]?.ready).toBe(true) // B=3
    expect(clusters[1]?.ready).toBe(false) // A=1
  })

  it('region 없으면 "기타"로 묶음', () => {
    const clusters = regionClusters([P('1', null, null), P('2', null, '  ')], 3)
    expect(clusters[0]?.regionLabel).toBe('기타')
    expect(clusters[0]?.count).toBe(2)
  })
})
