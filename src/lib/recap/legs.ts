import type { RecapVertex } from '@/lib/recap/recapStats'

// 도로 스냅 leg 도출/병합(순수). 클라가 인접 leg(N-1)만 프록시에 보내 provider 경유지 상한을 우회.
export type LatLng = { lat: number; lng: number }
export type Leg = { from: LatLng; to: LatLng }
export type LegResult = { polyline: LatLng[] | null; distanceMeters: number | null; degraded: boolean }

/** 정점 → 인접 구간(leg) 배열. */
export function toLegs(vertices: LatLng[]): Leg[] {
  const legs: Leg[] = []
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1]!
    const b = vertices[i]!
    legs.push({ from: { lat: a.lat, lng: a.lng }, to: { lat: b.lat, lng: b.lng } })
  }
  return legs
}

/** 정점 변경(추가/삭제/순서/좌표) 시 캐시 무효화용 안정 키. */
export function verticesKey(vertices: RecapVertex[]): string {
  return vertices.map((v) => `${v.visitId}:${v.lat.toFixed(5)},${v.lng.toFixed(5)}`).join('|')
}

/** leg 결과를 순서대로 연결. degraded leg는 직선([from,to])으로 메워 연속성 보장 + 인접 중복점 제거. */
export function mergeLegPolylines(legs: Leg[], results: LegResult[]): LatLng[] {
  const out: LatLng[] = []
  legs.forEach((leg, i) => {
    const r = results[i]
    const seg = r && r.polyline && r.polyline.length >= 2 ? r.polyline : [leg.from, leg.to]
    for (const p of seg) {
      const last = out[out.length - 1]
      if (!last || last.lat !== p.lat || last.lng !== p.lng) out.push(p)
    }
  })
  return out
}

/** 도로 거리 합(km, 소수1). 하나라도 거리 미상(degraded/null)이면 null → 측지선 거리로 폴백. */
export function roadDistanceKm(results: LegResult[]): number | null {
  let m = 0
  for (const r of results) {
    if (!r || r.distanceMeters == null) return null
    m += r.distanceMeters
  }
  return Math.round((m / 1000) * 10) / 10
}
