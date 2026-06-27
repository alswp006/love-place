// 동선 폴리라인 다운샘플 — Douglas–Peucker(순수). 과대샘플 GPS 점을 시각적으로 동등한 최소 점으로.
// 설계 §2.2: recorded 동선은 실측이라 도로 스냅 불필요 — 단순화만으로 렌더/배터리 비용↓.

export type LatLng = { lat: number; lng: number }

// 점 p와 선분 a-b 사이 수직거리(m). 작은 범위는 equirectangular 평면 근사로 충분.
function perpDistanceM(p: LatLng, a: LatLng, b: LatLng): number {
  const mPerDegLat = 111_320
  const mPerDegLng = 111_320 * Math.cos((a.lat * Math.PI) / 180)
  const bx = (b.lng - a.lng) * mPerDegLng
  const by = (b.lat - a.lat) * mPerDegLat
  const px = (p.lng - a.lng) * mPerDegLng
  const py = (p.lat - a.lat) * mPerDegLat
  const len2 = bx * bx + by * by
  if (len2 === 0) return Math.hypot(px, py)
  let t = (px * bx + py * by) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - t * bx, py - t * by)
}

function dp(pts: LatLng[], first: number, last: number, eps: number, keep: Set<number>): void {
  let maxD = 0
  let idx = -1
  const a = pts[first]!
  const b = pts[last]!
  for (let i = first + 1; i < last; i++) {
    const d = perpDistanceM(pts[i]!, a, b)
    if (d > maxD) {
      maxD = d
      idx = i
    }
  }
  if (maxD > eps && idx !== -1) {
    dp(pts, first, idx, eps, keep)
    keep.add(idx)
    dp(pts, idx, last, eps, keep)
  }
}

/** 폴리라인을 Douglas–Peucker로 단순화. epsilon(m) 이내로 평탄한 점은 제거. 양끝은 항상 보존. */
export function simplifyPath(points: LatLng[], epsilonMeters = 8): LatLng[] {
  const n = points.length
  if (n <= 2) return points.slice()
  const keep = new Set<number>([0, n - 1])
  dp(points, 0, n - 1, epsilonMeters, keep)
  return [...keep].sort((a, b) => a - b).map((i) => points[i]!)
}
