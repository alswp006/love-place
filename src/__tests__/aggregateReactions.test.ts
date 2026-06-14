import { describe, it, expect } from 'vitest'
import { aggregateReactions, type ReactionRow } from '@/lib/places/aggregateReactions'

const rows: ReactionRow[] = [
  { id: 'r1', target_id: 'p1', user_id: 'u1', emoji: '❤️', version: 1 },
  { id: 'r2', target_id: 'p1', user_id: 'u2', emoji: '❤️', version: 1 },
  { id: 'r3', target_id: 'p2', user_id: 'u2', emoji: '❤️', version: 1 },
]

describe('aggregateReactions (리액션 집계 — 순수)', () => {
  it('place별 count와 내가 눌렀는지(didIReact)를 집계한다', () => {
    const agg = aggregateReactions(rows, 'u1')
    expect(agg['p1']).toEqual({ count: 2, didIReact: true })
    expect(agg['p2']).toEqual({ count: 1, didIReact: false })
  })

  it('myId가 null이면 didIReact는 전부 false', () => {
    const agg = aggregateReactions(rows, null)
    expect(agg['p1']!.didIReact).toBe(false)
    expect(agg['p2']!.didIReact).toBe(false)
  })

  it('빈 입력은 빈 맵', () => {
    expect(aggregateReactions([], 'u1')).toEqual({})
  })
})
