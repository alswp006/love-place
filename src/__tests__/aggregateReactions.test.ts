import { describe, it, expect } from 'vitest'
import { aggregateReactions, reactionLabel, type ReactionRow } from '@/lib/places/aggregateReactions'

const rows: ReactionRow[] = [
  { id: 'r1', target_id: 'p1', user_id: 'u1', emoji: '❤️', version: 1 },
  { id: 'r2', target_id: 'p1', user_id: 'u2', emoji: '❤️', version: 1 },
  { id: 'r3', target_id: 'p2', user_id: 'u2', emoji: '❤️', version: 1 },
]

describe('aggregateReactions (리액션 집계 — 순수)', () => {
  it('place별 count와 내가 눌렀는지(didIReact)를 집계한다', () => {
    const agg = aggregateReactions(rows, 'u1')
    expect(agg['p1']).toMatchObject({ count: 2, didIReact: true })
    expect(agg['p2']).toMatchObject({ count: 1, didIReact: false })
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

describe('reactionLabel — 누가 눌렀나(ux §2)', () => {
  const agg = (userIds: string[], myId: string | null) =>
    aggregateReactions(
      userIds.map((u, i) => ({ id: `r${i}`, target_id: 'p1', user_id: u, emoji: '❤️', version: 1 })),
      myId,
    ).p1

  it('숫자 대신 상태 문장으로 말한다', () => {
    expect(reactionLabel(agg(['me'], 'me'), 'me')).toBe('내가 하트를 눌렀어요')
    expect(reactionLabel(agg(['you'], 'me'), 'me')).toBe('상대가 하트를 눌렀어요')
    expect(reactionLabel(agg(['me', 'you'], 'me'), 'me')).toBe('둘 다 하트를 눌렀어요')
  })

  it('없으면 없다고 한다', () => {
    expect(reactionLabel(undefined, 'me')).toBe('하트 없음')
  })

  it('집계가 user_id를 더 이상 버리지 않는다', () => {
    expect(agg(['me', 'you'], 'me')?.userIds).toEqual(['me', 'you'])
  })
})
