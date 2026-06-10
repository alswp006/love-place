import { describe, it, expect } from 'vitest'
import { visitCountByTrip, groupTripsByRegion } from '@/lib/places/tripGroups'

describe('visitCountByTrip', () => {
  it('trip_id별 집계, null 무시', () => {
    const counts = visitCountByTrip([
      { trip_id: 't1' },
      { trip_id: 't1' },
      { trip_id: 't2' },
      { trip_id: null },
    ])
    expect(counts).toEqual({ t1: 2, t2: 1 })
  })
})

describe('groupTripsByRegion', () => {
  it('region_code별 그룹, 없으면 미지정', () => {
    const groups = groupTripsByRegion([
      { id: 'a', region_code: '51210' },
      { id: 'b', region_code: '51210' },
      { id: 'c', region_code: null },
    ])
    const sokcho = groups.find((g) => g.regionKey === '51210')
    expect(sokcho?.trips.map((t) => t.id)).toEqual(['a', 'b'])
    expect(groups.find((g) => g.regionKey === '미지정')?.trips).toHaveLength(1)
  })
})
