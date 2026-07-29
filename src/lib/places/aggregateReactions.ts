// 리액션 행 → place별 집계(순수). { count, didIReact }. "누가 눌렀나" 도출(ux §2).
export type ReactionRow = {
  id: string
  target_id: string
  user_id: string
  emoji: string
  version: number
}
export type ReactionAgg = {
  count: number
  didIReact: boolean
  /** 누른 사람들. 집계가 user_id를 버리면 "상대가 하트를 눌렀어요"를 말할 수 없다. */
  userIds: string[]
}
export type ReactionMap = Record<string, ReactionAgg>

export function aggregateReactions(rows: ReactionRow[], myId: string | null): ReactionMap {
  const map: ReactionMap = {}
  for (const r of rows) {
    const cur = map[r.target_id] ?? { count: 0, didIReact: false, userIds: [] }
    cur.count += 1
    if (myId != null && r.user_id === myId) cur.didIReact = true
    if (!cur.userIds.includes(r.user_id)) cur.userIds.push(r.user_id)
    map[r.target_id] = cur
  }
  return map
}

/**
 * 2인 기준 하트 상태 문장 — 숫자만 조용히 +1 되는 대신 "누가 눌렀는지"를 말한다(ux §2).
 * 색·숫자에 의존하지 않는 접근성 라벨로도 그대로 쓴다(§8).
 */
export function reactionLabel(agg: ReactionAgg | undefined, myId: string | null): string {
  if (!agg || agg.count === 0) return '하트 없음'
  const partnerReacted = agg.userIds.some((u) => u !== myId)
  if (agg.didIReact && partnerReacted) return '둘 다 하트를 눌렀어요'
  if (agg.didIReact) return '내가 하트를 눌렀어요'
  if (partnerReacted) return '상대가 하트를 눌렀어요'
  return `하트 ${agg.count}개`
}
