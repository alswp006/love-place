import { describe, it, expect } from 'vitest'
import { memberPlaceIdSet, memberCollectionIdSet } from '@/lib/places/collectionFilter'
import type { PlaceCollectionRow } from '@/hooks/useCollections'

const rows: PlaceCollectionRow[] = [
  { id: 'a', collection_id: 'c1', place_id: 'p1', version: 1 },
  { id: 'b', collection_id: 'c1', place_id: 'p2', version: 1 },
  { id: 'c', collection_id: 'c2', place_id: 'p1', version: 1 },
]

describe('collectionFilter — 멤버십 도출(순수)', () => {
  it('memberPlaceIdSet: 컬렉션에 담긴 장소 id만 모은다', () => {
    expect(memberPlaceIdSet(rows, 'c1')).toEqual(new Set(['p1', 'p2']))
    expect(memberPlaceIdSet(rows, 'c2')).toEqual(new Set(['p1']))
    expect(memberPlaceIdSet(rows, 'none')).toEqual(new Set())
  })

  it('memberCollectionIdSet: 장소가 담긴 컬렉션 id만 모은다(다대다)', () => {
    expect(memberCollectionIdSet(rows, 'p1')).toEqual(new Set(['c1', 'c2']))
    expect(memberCollectionIdSet(rows, 'p2')).toEqual(new Set(['c1']))
    expect(memberCollectionIdSet(rows, 'none')).toEqual(new Set())
  })

  it('빈 입력은 빈 집합', () => {
    expect(memberPlaceIdSet([], 'c1')).toEqual(new Set())
    expect(memberCollectionIdSet([], 'p1')).toEqual(new Set())
  })
})
