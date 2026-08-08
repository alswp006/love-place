import { describe, it, expect } from 'vitest'
import { visitCountByTrip, groupTripsByRegion, deriveTripRegion, groupTripsByKey } from '@/lib/places/tripGroups'

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

describe('deriveTripRegion — 여행의 지역은 저장이 아니라 도출(§7)', () => {
  it('담긴 장소의 지역 중 가장 많은 것이 그 여행의 지역', () => {
    expect(deriveTripRegion({ region_code: null }, ['강릉', '강릉', '속초'])).toBe('강릉')
  })

  it('동수면 먼저 담은 쪽 — 목록이 새로고침마다 흔들리면 안 된다', () => {
    expect(deriveTripRegion({ region_code: null }, ['속초', '강릉'])).toBe('속초')
  })

  it('사람이 정한 region_code가 도출보다 우선', () => {
    expect(deriveTripRegion({ region_code: '강릉' }, ['속초', '속초'])).toBe('강릉')
  })

  it('담긴 곳이 없거나 지역을 모르면 null(미지정)', () => {
    expect(deriveTripRegion({ region_code: null }, [])).toBeNull()
    expect(deriveTripRegion({ region_code: null }, [null, '  '])).toBeNull()
  })
})

describe('groupTripsByKey', () => {
  it('미지정은 항상 맨 뒤 — 지역을 아는 여행이 먼저 보여야 한다', () => {
    const groups = groupTripsByKey(
      [{ id: 'a', r: null }, { id: 'b', r: '강릉' }, { id: 'c', r: null }, { id: 'd', r: '속초' }],
      (t) => t.r,
    )
    expect(groups.map((g) => g.regionKey)).toEqual(['강릉', '속초', '미지정'])
    expect(groups[2]!.trips.map((t) => t.id)).toEqual(['a', 'c'])
  })
})
