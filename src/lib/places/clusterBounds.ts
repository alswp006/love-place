import type { ClusterPoint } from './clusterPlaces'

export function clusterMemberPts(ids: string[], pts: ClusterPoint[]): ClusterPoint[] {
  const set = new Set(ids)
  return pts.filter((p) => set.has(p.id))
}

// 멤버 좌표 스팬이 minDeg 미만이면 degenerate(동일/근접 좌표) → fitBounds 과확대 방지.
export function boundsSpanTiny(memberPts: ClusterPoint[], minDeg = 0.0005): boolean {
  if (memberPts.length === 0) return true
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
  for (const p of memberPts) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }
  return (maxLat - minLat) < minDeg && (maxLng - minLng) < minDeg
}
