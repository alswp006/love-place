// 마커 클러스터링(spec §3.7) — 순수 그리드 클러스터러.
// 편차(web-stack §5 "네이버 MarkerClustering 샘플"): 샘플은 TS 타입이 없어 strict/any 금지에 위배되고
// 명령형 오버레이라 테스트가 어렵다. 동일한 시각 결과(개수 배지 클러스터)를 순수 함수로 구현(research 02 §3).
// 줌이 높을수록 셀이 작아져 분해능↑(가까운 점도 개별). 좌표는 멤버 centroid. naver/DOM 비의존.

export type ClusterPoint = { id: string; lat: number; lng: number }

export type ClusterOrSingle =
  | { kind: 'single'; id: string; lat: number; lng: number }
  | { kind: 'cluster'; lat: number; lng: number; count: number; ids: string[] }

// 줌별 그리드 셀 크기(도, degrees). 줌이 커질수록 셀이 절반씩 작아진다(단조 감소면 충분, 정밀 지리 아님).
// zoom<=6: ~1.0°(~111km), zoom 12: ~1.56e-2°(~1.7km), zoom 18: ~2.44e-4°(~27m),
// zoom 20: ~6.10e-5°(~6.8m). 가까운 두 점(~14m)은 zoom 18까진 같은 셀, zoom 20에서 분리된다.
function cellSizeDeg(zoom: number): number {
  // base 1.0° at zoom 6, 줌 1 증가마다 절반.
  const exp = Math.max(0, zoom - 6)
  return 1.0 / Math.pow(2, exp)
}

export function clusterPlaces(points: ClusterPoint[], zoom: number): ClusterOrSingle[] {
  if (points.length === 0) return []
  const size = cellSizeDeg(zoom)
  const buckets = new Map<string, ClusterPoint[]>()
  for (const p of points) {
    const gx = Math.floor(p.lng / size)
    const gy = Math.floor(p.lat / size)
    const key = `${gx}:${gy}`
    const arr = buckets.get(key)
    if (arr) arr.push(p)
    else buckets.set(key, [p])
  }
  const out: ClusterOrSingle[] = []
  for (const arr of buckets.values()) {
    if (arr.length === 1) {
      const p = arr[0]!
      out.push({ kind: 'single', id: p.id, lat: p.lat, lng: p.lng })
    } else {
      const count = arr.length
      const lat = arr.reduce((s, p) => s + p.lat, 0) / count
      const lng = arr.reduce((s, p) => s + p.lng, 0) / count
      out.push({ kind: 'cluster', lat, lng, count, ids: arr.map((p) => p.id) })
    }
  }
  return out
}
