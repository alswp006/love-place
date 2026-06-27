// R6 동선 점 오프라인 큐 — 기존 OutboxStore 인프라 재사용(별도 DB, 메모리 폴백=테스트).
// 약전파/백그라운드에서 수집한 점을 durable하게 쌓고 재연결 시 record_points로 flush. 유실 0·중복 0.
// 설계 §2.1(② 네이티브 HTTP + IndexedDB 큐), §6(WebView fetch throttle 회피는 recorder 책임).

import {
  type OutboxStore,
  createMemoryStore,
  createIdbStore,
} from '@/state/outboxStore'
import type { PendingPoint } from './types'

const KIND = 'route.point'

type PointPayload = { sessionId: string; point: PendingPoint }

/** 점 전용 durable store(브라우저=IndexedDB 별도 DB, 아니면 메모리). 메인 아웃박스와 분리. */
export function createDefaultPointStore(): OutboxStore {
  if (typeof indexedDB !== 'undefined') {
    try {
      return createIdbStore('love_place_points', 'route_points')
    } catch {
      return createMemoryStore()
    }
  }
  return createMemoryStore()
}

/** 점 1건을 큐에 적재. client_point_id로 멱등(이미 있으면 중복 적재 안 함) → false 반환. */
export async function enqueuePoint(
  store: OutboxStore,
  sessionId: string,
  point: PendingPoint,
): Promise<boolean> {
  const all = await store.getAll()
  if (all.some((e) => e.id === point.client_point_id)) return false
  const payload: PointPayload = { sessionId, point }
  await store.add({
    id: point.client_point_id,
    kind: KIND,
    payload,
    createdAt: Date.parse(point.recorded_at) || 0,
    dedupeKey: point.client_point_id,
  })
  return true
}

/** 해당 세션의 미발송 점(시간순). */
export async function pendingPoints(store: OutboxStore, sessionId: string): Promise<PendingPoint[]> {
  const all = await store.getAll()
  return all
    .filter((e) => e.kind === KIND && (e.payload as PointPayload).sessionId === sessionId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((e) => (e.payload as PointPayload).point)
}

export type PointSender = (sessionId: string, points: PendingPoint[]) => Promise<number>

/**
 * 세션의 미발송 점을 sender(record_points)로 전송하고, 성공 시 큐에서 제거.
 * sender가 throw하면 점은 보존(재연결 재시도) — 유실 0. 서버 멱등(client_point_id) → 중복 0.
 */
export async function flush(
  store: OutboxStore,
  sessionId: string,
  sender: PointSender,
): Promise<number> {
  const pending = await pendingPoints(store, sessionId)
  if (pending.length === 0) return 0
  const sent = await sender(sessionId, pending) // throw 시 아래 제거 스킵
  for (const p of pending) await store.remove(p.client_point_id)
  return sent
}
