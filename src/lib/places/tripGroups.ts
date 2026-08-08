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

/**
 * 여행의 지역 — 저장하지 않고 도출한다(CLAUDE.md §7).
 *
 * 여행에 담긴 장소들의 region_label 중 가장 많은 것이 그 여행의 지역이다.
 * "강릉 1박2일"에 강릉 장소를 담는 순간 지역별 보기의 '강릉' 아래로 들어간다 —
 * 지역을 따로 고르게 하면 아무도 안 고르고 전부 '미지정'에 쌓인다(지금이 그 상태다).
 * 동수면 먼저 담은 쪽(입력 순서)이 이긴다 — 결정론적이어야 목록이 흔들리지 않는다.
 *
 * trip.region_code가 명시돼 있으면 그게 우선(사람이 정한 것 > 도출).
 */
export function deriveTripRegion(
  trip: { region_code: string | null },
  stopRegionLabels: readonly (string | null)[],
): string | null {
  if (trip.region_code) return trip.region_code
  const count = new Map<string, number>()
  for (const label of stopRegionLabels) {
    const key = label?.trim()
    if (!key) continue
    count.set(key, (count.get(key) ?? 0) + 1)
  }
  let best: string | null = null
  let bestN = 0
  for (const [key, n] of count) {
    if (n > bestN) {
      best = key
      bestN = n
    }
  }
  return best
}

/**
 * 지역 키로 그룹핑 — 키는 호출부가 정한다(도출한 지역 or region_code).
 * 지역이 없는 여행은 '미지정'으로 묶고 **항상 맨 뒤**로 보낸다:
 * 지역을 아는 여행이 먼저 보여야 지역별 보기가 쓸모 있다.
 */
export function groupTripsByKey<T>(
  trips: readonly T[],
  keyOf: (t: T) => string | null,
): RegionTripGroup<T>[] {
  const map = new Map<string, T[]>()
  for (const t of trips) {
    const key = keyOf(t) ?? '미지정'
    const arr = map.get(key) ?? []
    arr.push(t)
    map.set(key, arr)
  }
  const groups = Array.from(map.entries()).map(([regionKey, ts]) => ({ regionKey, trips: ts }))
  return groups.sort((a, b) => {
    if (a.regionKey === '미지정') return 1
    if (b.regionKey === '미지정') return -1
    return 0
  })
}
