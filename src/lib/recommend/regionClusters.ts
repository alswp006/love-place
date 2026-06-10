// 지역별 추천 클러스터링(§5.6 / 01-spec.md:97) — 같은 지역 장소가 임계치(3~5) 이상 모이면 추천 후보.
// 순수 함수(테스트로 못박음). AI 코스 생성은 P4b(프록시) — 여기선 클러스터 도출만.

export type ClusterInput = { id: string; region_code?: string | null; region_label: string | null }

export type RegionCluster = {
  regionCode: string | null
  regionLabel: string
  placeIds: string[]
  count: number
  ready: boolean // 임계치 충족(코스 짤 만큼 모임)
}

export const RECO_THRESHOLD = 3

/** region_code(없으면 label) 기준 그룹핑 → count 내림차순. ready = count >= threshold. */
export function regionClusters(places: ClusterInput[], threshold: number = RECO_THRESHOLD): RegionCluster[] {
  const map = new Map<string, RegionCluster>()
  for (const p of places) {
    const label = p.region_label?.trim() || '기타'
    const key = p.region_code ?? `label:${label}`
    const cur =
      map.get(key) ??
      { regionCode: p.region_code ?? null, regionLabel: label, placeIds: [], count: 0, ready: false }
    cur.placeIds.push(p.id)
    cur.count += 1
    map.set(key, cur)
  }
  return Array.from(map.values())
    .map((c) => ({ ...c, ready: c.count >= threshold }))
    .sort((a, b) => b.count - a.count)
}
