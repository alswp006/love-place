// R6 동선 기록 타입 + 경계 파서(수동 타입가드 — 프로젝트 관례, zod 미사용).
// 외부 응답(get_session_points RPC, consent_log row)은 여기서 파싱 후 타입 신뢰(web-stack §1).

export type ConsentType =
  | 'COLLECT_USE'
  | 'THIRD_PARTY_PROVIDE_PARTNER'
  | 'NOTIFY_METHOD'
  | 'RESERVE_NOTICE_ACK'
export const CONSENT_TYPES: readonly ConsentType[] = [
  'COLLECT_USE',
  'THIRD_PARTY_PROVIDE_PARTNER',
  'NOTIFY_METHOD',
  'RESERVE_NOTICE_ACK',
]

export type ConsentScope = 'RECAP' | 'REALTIME'
export type NotifyMode = 'IMMEDIATE' | 'BATCHED_30D'
export type SessionStatus = 'RECORDING' | 'PAUSED' | 'DONE' | 'DISCARDED'

/** get_session_points RPC가 반환하는 복호 좌표 점. */
export type RoutePoint = {
  recorded_at: string
  lat: number
  lng: number
  accuracy_m: number | null
}

export type TripSession = {
  id: string
  couple_id: string
  trip_id: string | null
  owner_id: string
  status: SessionStatus
  started_at: string
  ended_at: string | null
  point_count: number
  recorded_distance_m: number | null
  version: number
}

/** 큐→record_points로 보내는 미발송 점(client_point_id 멱등키 포함). */
export type PendingPoint = {
  client_point_id: string
  recorded_at: string
  lat: number
  lng: number
  accuracy_m?: number | null
  speed_mps?: number | null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** RPC 점 1건 파싱. 좌표 범위 밖/누락이면 null(폴리라인 정합 보장). */
export function parseRoutePoint(raw: unknown): RoutePoint | null {
  if (!isRecord(raw)) return null
  const { recorded_at, lat, lng, accuracy_m } = raw
  if (typeof recorded_at !== 'string' || recorded_at === '') return null
  if (!isFiniteNum(lat) || lat < -90 || lat > 90) return null
  if (!isFiniteNum(lng) || lng < -180 || lng > 180) return null
  return {
    recorded_at,
    lat,
    lng,
    accuracy_m: isFiniteNum(accuracy_m) ? accuracy_m : null,
  }
}

/** RPC 점 배열 파싱(불량 점 제외). */
export function parseRoutePoints(raw: unknown): RoutePoint[] {
  if (!Array.isArray(raw)) return []
  const out: RoutePoint[] = []
  for (const r of raw) {
    const p = parseRoutePoint(r)
    if (p) out.push(p)
  }
  return out
}

export function isConsentType(v: unknown): v is ConsentType {
  return typeof v === 'string' && (CONSENT_TYPES as readonly string[]).includes(v)
}
