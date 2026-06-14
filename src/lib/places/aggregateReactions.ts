// 리액션 행 → place별 집계(순수). { count, didIReact }. "누가 눌렀나" 도출(ux §2).
export type ReactionRow = {
  id: string
  target_id: string
  user_id: string
  emoji: string
  version: number
}
export type ReactionAgg = { count: number; didIReact: boolean }
export type ReactionMap = Record<string, ReactionAgg>

export function aggregateReactions(rows: ReactionRow[], myId: string | null): ReactionMap {
  const map: ReactionMap = {}
  for (const r of rows) {
    const cur = map[r.target_id] ?? { count: 0, didIReact: false }
    cur.count += 1
    if (myId != null && r.user_id === myId) cur.didIReact = true
    map[r.target_id] = cur
  }
  return map
}
