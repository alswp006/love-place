import { describe, it, expect } from 'vitest'
import {
  deriveWishStatus,
  attachAndSortWishes,
  cyclePriority,
  MAX_PRIORITY,
  type WishInfo,
} from '@/lib/places/wishStatus'

const ME = 'me-uuid'
const PARTNER = 'partner-uuid'

describe('deriveWishStatus', () => {
  it('아무도 안 찜', () => {
    const s = deriveWishStatus(undefined, ME)
    expect(s.wishCount).toBe(0)
    expect(s.bothWished).toBe(false)
    expect(s.wishedByMe).toBe(false)
    expect(s.wishedByPartner).toBe(false)
  })

  it('나만 찜', () => {
    const s = deriveWishStatus({ userIds: [ME], totalPriority: 0, maxPriority: 0 }, ME)
    expect(s.wishedByMe).toBe(true)
    expect(s.wishedByPartner).toBe(false)
    expect(s.bothWished).toBe(false)
  })

  it('상대만 찜', () => {
    const s = deriveWishStatus({ userIds: [PARTNER], totalPriority: 0, maxPriority: 0 }, ME)
    expect(s.wishedByMe).toBe(false)
    expect(s.wishedByPartner).toBe(true)
    expect(s.bothWished).toBe(false)
  })

  it('둘 다 찜 (핵심 신호)', () => {
    const s = deriveWishStatus({ userIds: [ME, PARTNER], totalPriority: 5, maxPriority: 3 }, ME)
    expect(s.bothWished).toBe(true)
    expect(s.wishedByMe).toBe(true)
    expect(s.wishedByPartner).toBe(true)
    expect(s.wishCount).toBe(2)
    expect(s.totalPriority).toBe(5)
    expect(s.maxPriority).toBe(3)
  })

  it('myId 미상(null)이어도 인원수로 bothWished 도출', () => {
    const s = deriveWishStatus({ userIds: ['a', 'b'], totalPriority: 0, maxPriority: 0 }, null)
    expect(s.bothWished).toBe(true)
  })
})

describe('attachAndSortWishes', () => {
  it('둘 다 찜 → 찜 인원 → 우선순위 합 순으로 정렬', () => {
    const places = [
      { id: 'p-single-lowprio' },
      { id: 'p-both' },
      { id: 'p-single-highprio' },
      { id: 'p-none' },
    ]
    const wishes: Record<string, WishInfo> = {
      'p-single-lowprio': { userIds: [ME], totalPriority: 1, maxPriority: 1 },
      'p-both': { userIds: [ME, PARTNER], totalPriority: 0, maxPriority: 0 },
      'p-single-highprio': { userIds: [PARTNER], totalPriority: 9, maxPriority: 3 },
    }
    const sorted = attachAndSortWishes(places, wishes, ME)
    expect(sorted.map((p) => p.id)).toEqual([
      'p-both', // 둘 다 찜이 최우선
      'p-single-highprio', // 찜 1명, 우선순위 9
      'p-single-lowprio', // 찜 1명, 우선순위 1
      'p-none', // 찜 0
    ])
  })

  it('동률은 입력 순서(최신순) 유지 — 안정 정렬', () => {
    const places = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const wishes: Record<string, WishInfo> = {
      a: { userIds: [ME], totalPriority: 0, maxPriority: 0 },
      b: { userIds: [ME], totalPriority: 0, maxPriority: 0 },
      c: { userIds: [ME], totalPriority: 0, maxPriority: 0 },
    }
    const sorted = attachAndSortWishes(places, wishes, ME)
    expect(sorted.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('cyclePriority', () => {
  it('0→1→2→3 증가 후 3→0 순환', () => {
    expect(cyclePriority(0)).toBe(1)
    expect(cyclePriority(1)).toBe(2)
    expect(cyclePriority(2)).toBe(3)
    expect(cyclePriority(MAX_PRIORITY)).toBe(0) // 3 → 0
  })
})
