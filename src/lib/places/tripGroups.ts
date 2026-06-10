// Trips 도출 — 순수 함수(테스트로 못박음). 여행별 방문 수 집계 + 지역별 그룹핑.

/** trip_id별 방문 수(여행 카드에 "N곳 방문" 표시). null trip_id는 무시. */
export function visitCountByTrip(visits: { trip_id: string | null }[]): Record<string, number> {
  const m: Record<string, number> = {}
  for (const v of visits) {
    if (v.trip_id) m[v.trip_id] = (m[v.trip_id] ?? 0) + 1
  }
  return m
}

export type RegionTripGroup<T> = { regionKey: string; trips: T[] }

/** region_code(없으면 '미지정')별 그룹핑. 입력 순서 보존. */
export function groupTripsByRegion<T extends { region_code: string | null }>(trips: T[]): RegionTripGroup<T>[] {
  const map = new Map<string, T[]>()
  for (const t of trips) {
    const key = t.region_code ?? '미지정'
    const arr = map.get(key) ?? []
    arr.push(t)
    map.set(key, arr)
  }
  return Array.from(map.entries()).map(([regionKey, ts]) => ({ regionKey, trips: ts }))
}
