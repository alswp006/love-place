// 여행 리캡 도출 — 순수 함수(테스트로 못박음). read-side(visits+places)에서 순서 정점·거리·스탯 도출.
// 도로 스냅 아님(측지선 — 실제 경로 미기록, spec). 거리는 클라이언트 haversine 합("장소→장소 거리").

export type RecapVertex = {
  visitId: string
  placeId: string
  name: string
  lat: number
  lng: number
  visitDate: string | null
  regionLabel: string | null
}

export type RecapStats = { stopCount: number; distanceKm: number; days: number }

type VisitLike = { id: string; place_id: string; trip_id: string | null; visit_date: string | null }
type PlaceLike = {
  id: string
  name: string
  lat: number | null
  lng: number | null
  region_label: string | null
}

const R = 6371 // 지구 반경(km)
function toRad(d: number): number {
  return (d * Math.PI) / 180
}

/** 두 좌표 간 측지선 거리(km, haversine). */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/**
 * 여행 방문을 시간순(visit_date 오름차, 동률은 id로 안정 정렬) 정점 배열로.
 * 좌표(lat/lng)가 없는 장소/누락 place는 동선에서 제외(폴리라인 정합 보장).
 */
export function orderedVertices(
  visits: VisitLike[],
  placesById: Record<string, PlaceLike>,
): RecapVertex[] {
  const out: RecapVertex[] = []
  for (const v of visits) {
    const p = placesById[v.place_id]
    if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') continue
    out.push({
      visitId: v.id,
      placeId: v.place_id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      visitDate: v.visit_date,
      regionLabel: p.region_label,
    })
  }
  out.sort((a, b) => {
    const da = a.visitDate ?? ''
    const db = b.visitDate ?? ''
    if (da !== db) return da < db ? -1 : 1
    return a.visitId < b.visitId ? -1 : a.visitId > b.visitId ? 1 : 0
  })
  return out
}

/** 정점/여행에서 3-스탯: 장소 수 · 인접 거리 합(km) · 기간(일, 양끝 포함). */
export function recapStats(
  vertices: RecapVertex[],
  trip: { start_date: string; end_date: string } | null,
): RecapStats {
  let distanceKm = 0
  for (let i = 1; i < vertices.length; i++) {
    distanceKm += haversineKm(vertices[i - 1]!, vertices[i]!)
  }
  let days = 0
  if (trip) {
    const s = Date.parse(trip.start_date)
    const e = Date.parse(trip.end_date)
    if (!Number.isNaN(s) && !Number.isNaN(e) && e >= s) {
      days = Math.round((e - s) / 86_400_000) + 1
    }
  }
  return { stopCount: vertices.length, distanceKm: Math.round(distanceKm * 10) / 10, days }
}
