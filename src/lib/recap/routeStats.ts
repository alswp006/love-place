// 기록 동선(route_points) 도출 — 순수 함수. get_session_points RPC 결과/로컬 큐 점을 정렬·디듑·거리 계산.
// 설계 §2.2: recordedDistanceKm = 연속 점 haversine 누적(실측 이동거리, 방문간 직선과 구분).

import { haversineKm } from './recapStats'

export type RoutePointLike = {
  recorded_at: string
  lat: number
  lng: number
  accuracy_m?: number | null
  client_point_id?: string
}

/** recorded_at 오름차 정렬 + 중복 제거(client_point_id 우선, 없으면 recorded_at+좌표). */
export function orderedRoute<T extends RoutePointLike>(points: T[]): T[] {
  const seen = new Set<string>()
  const deduped: T[] = []
  for (const p of points) {
    const key = p.client_point_id ?? `${p.recorded_at}|${p.lat}|${p.lng}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(p)
  }
  deduped.sort((a, b) => {
    if (a.recorded_at !== b.recorded_at) return a.recorded_at < b.recorded_at ? -1 : 1
    return 0
  })
  return deduped
}

/** 연속 점 사이 haversine 거리 누적(km). 0~1점이면 0. */
export function recordedDistanceKm(points: { lat: number; lng: number }[]): number {
  let km = 0
  for (let i = 1; i < points.length; i++) {
    km += haversineKm(points[i - 1]!, points[i]!)
  }
  return Math.round(km * 10) / 10
}

/** 첫~마지막 점 사이 경과 분(리캡 ⏱️ 스탯). 정렬 전제 없음(내부 min/max). 0~1점이면 0. */
export function recordedDurationMin(points: { recorded_at: string }[]): number {
  if (points.length < 2) return 0
  let min = Infinity
  let max = -Infinity
  for (const p of points) {
    const t = Date.parse(p.recorded_at)
    if (!Number.isFinite(t)) continue
    if (t < min) min = t
    if (t > max) max = t
  }
  return min < max ? Math.round((max - min) / 60_000) : 0
}
