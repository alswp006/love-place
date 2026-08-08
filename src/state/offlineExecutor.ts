import { versionedUpdate, softDelete, restore } from '@/lib/sync/versionedUpdate'
import { savePlace } from '@/lib/places/savePlace'
import { supabase } from '@/lib/supabase/client'
import type { KakaoPlaceHit } from '@/lib/kakao/types'
import type { NewEvent, EventPatch } from '@/hooks/useEventMutations'
import type { OutboxEntry } from './outboxStore'
import type { FlushOutcome } from './offlineQueue'

// 아웃박스 항목 → 실제 Supabase op. 큐 매니저(offlineQueue)가 재연결 시 이 함수로 재생한다.
// 반환: 'ok'(적용) | 'conflict'(서버가 더 최신 — 제거+보고). 네트워크 오류는 throw → 큐가 잔류시키고 재시도.

// 휴지통 delete/restore가 가능한 테이블 집합 — useTrash의 TrashKind와 1:1 정렬(드리프트 방지).
const TRASH_TABLES = ['places', 'events', 'visits', 'photos', 'trips', 'itineraries'] as const
type TrashTable = typeof TRASH_TABLES[number]
// 토큰(정규식 캡처) → 실제 테이블. 일반형(plural)은 그대로, 레거시 단수 alias(usePlaceTrash/useRestoreEvent가
// enqueue하는 'place'/'event')는 plural 테이블로 매핑 → 둘 다 재생 보장(유실 0).
const TRASH_TABLE_BY_TOKEN: Record<string, TrashTable> = {
  ...Object.fromEntries(TRASH_TABLES.map((t) => [t, t])),
  place: 'places',
  event: 'events',
}

// 레거시 단수 alias(현재 코드가 실제로 enqueue 중) — 일반형과 함께 OutboxKind에 포함.
type LegacyTrashAlias = 'place' | 'event'

export type OutboxKind =
  | 'wish.setPriority' | 'place.save'
  | 'visit.add' | 'visit.remove' | 'visit.review' | 'reaction.toggle' | 'wish.toggle'
  | 'event.create' | 'event.update' | 'event.done'
  | `${TrashTable}.delete` | `${TrashTable}.restore` // = 6×2(place/event/visit/photo/trip/itinerary delete·restore)
  | `${LegacyTrashAlias}.delete` | `${LegacyTrashAlias}.restore` // 레거시 단수(place/event) — 매핑 후 재생

type SetPriorityPayload = { wishId: string; expectedVersion: number; priority: number; myId: string }
type VersionedTargetPayload = { id: string; expectedVersion: number; myId: string }
type SavePayload = { coupleId: string; hit: KakaoPlaceHit; uid: string }
type VisitAddPayload = { coupleId: string; placeId: string; visitDate: string; myId: string }
type VisitRemovePayload = { placeId: string; myId: string; coupleId: string }
type VisitReviewPayload = {
  coupleId: string; placeId: string; tripId: string | null; visitDate: string
  rating: number | null; memo: string | null; myId: string
}
type ReactionTogglePayload = { coupleId: string; placeId: string; myId: string }
type WishTogglePayload = { coupleId: string; placeId: string; myId: string }
type EventCreatePayload = { coupleId: string; myId: string; event: NewEvent }
type EventUpdatePayload = { id: string; expectedVersion: number; patch: EventPatch; myId: string }
type EventDonePayload = {
  coupleId: string; eventId: string; occurrenceStart: string; myId: string
}

export async function executeOutbox(entry: OutboxEntry): Promise<FlushOutcome> {
  switch (entry.kind) {
    case 'wish.setPriority': {
      const p = entry.payload as SetPriorityPayload
      const r = await versionedUpdate('wishes', p.wishId, p.expectedVersion, {
        priority: p.priority,
        updated_by: p.myId,
      })
      return r.status
    }
    case 'place.save': {
      const p = entry.payload as SavePayload
      await savePlace(p.coupleId, p.hit, p.uid) // 중복은 dedup으로 흡수(재생 안전)
      return 'ok'
    }
    case 'visit.add': {
      const p = entry.payload as VisitAddPayload
      // 재생 안전: 이미 활성 방문행이 있으면 no-op(중복 insert 방지).
      const { data: existing } = await supabase
        .from('visits').select('id').eq('couple_id', p.coupleId).eq('place_id', p.placeId).is('deleted_at', null).limit(1)
      if (existing && existing.length > 0) return 'ok'
      const { error } = await supabase.from('visits').insert({
        couple_id: p.coupleId, place_id: p.placeId, visit_date: p.visitDate, created_by: p.myId, updated_by: p.myId,
      })
      if (error) throw new Error(error.message)
      return 'ok'
    }
    case 'visit.remove': {
      const p = entry.payload as VisitRemovePayload
      // flush 시점에 살아있는 방문행을 재조회(스냅샷 의존 제거) → 각각 version 조건부 softDelete.
      const { data: live } = await supabase
        .from('visits')
        .select('id, version')
        .eq('couple_id', p.coupleId)
        .eq('place_id', p.placeId)
        .is('deleted_at', null)
      const rows = (live ?? []) as { id: string; version: number }[]
      if (rows.length === 0) return 'ok' // 이미 취소됨 — 재생 안전(no-op)
      let conflicted = false
      for (const r of rows) {
        const res = await softDelete('visits', r.id, r.version, p.myId)
        if (res.status === 'conflict') conflicted = true
      }
      return conflicted ? 'conflict' : 'ok'
    }
    case 'visit.review': {
      const p = entry.payload as VisitReviewPayload
      // 재생 안전: flush 시점에 내 방문행을 다시 찾는다(있으면 update, 없으면 insert).
      const { data: mine } = await supabase
        .from('visits').select('id, version').eq('couple_id', p.coupleId).eq('place_id', p.placeId)
        .eq('created_by', p.myId).is('deleted_at', null).limit(1)
      const row = mine?.[0] as { id: string; version: number } | undefined
      if (row) {
        const r = await versionedUpdate('visits', row.id, row.version, {
          rating: p.rating, memo: p.memo, trip_id: p.tripId, updated_by: p.myId,
        })
        return r.status
      }
      const { error } = await supabase.from('visits').insert({
        couple_id: p.coupleId, place_id: p.placeId, trip_id: p.tripId, visit_date: p.visitDate,
        rating: p.rating, memo: p.memo, created_by: p.myId, updated_by: p.myId,
      })
      if (error) throw new Error(error.message)
      return 'ok'
    }
    case 'event.done': {
      // 재연결 시점의 실제 상태로 토글(방향을 큐에 고정하지 않음 — wish.toggle과 동형).
      const p = entry.payload as EventDonePayload
      const { data: live } = await supabase
        .from('event_completions').select('id, version')
        .eq('couple_id', p.coupleId).eq('event_id', p.eventId)
        .eq('occurrence_start', p.occurrenceStart).is('deleted_at', null).limit(1)
      const row = live?.[0] as { id: string; version: number } | undefined
      if (row) return (await softDelete('event_completions', row.id, row.version, p.myId)).status
      const { error } = await supabase.from('event_completions').insert({
        couple_id: p.coupleId, event_id: p.eventId, occurrence_start: p.occurrenceStart,
        created_by: p.myId, updated_by: p.myId,
      })
      if (error) throw new Error(error.message)
      return 'ok'
    }
    case 'reaction.toggle': {
      const p = entry.payload as ReactionTogglePayload
      const { data: mine } = await supabase
        .from('reactions').select('id, version').eq('couple_id', p.coupleId).eq('target_type', 'PLACE')
        .eq('target_id', p.placeId).eq('user_id', p.myId).is('deleted_at', null).limit(1)
      const existing = mine?.[0]
      if (existing) return (await softDelete('reactions', existing.id as string, existing.version as number, p.myId)).status
      const { error } = await supabase.from('reactions').insert({
        couple_id: p.coupleId, user_id: p.myId, target_type: 'PLACE', target_id: p.placeId,
        emoji: '❤️', created_by: p.myId, updated_by: p.myId,
      })
      if (error) throw new Error(error.message)
      return 'ok'
    }
    case 'wish.toggle': {
      // 재연결 시점의 실제 상태로 토글한다(큐에 담을 땐 방향을 고정하지 않음 — reaction.toggle과 동형).
      const p = entry.payload as WishTogglePayload
      const { data: mine } = await supabase
        .from('wishes').select('id, version').eq('couple_id', p.coupleId)
        .eq('place_id', p.placeId).eq('user_id', p.myId).is('deleted_at', null).limit(1)
      const existing = mine?.[0]
      if (existing) return (await softDelete('wishes', existing.id as string, existing.version as number, p.myId)).status
      // insert(upsert 아님) — uq_wishes_place_user가 부분 유니크라 onConflict 추론이 42P10을 낼 수 있다.
      const { error } = await supabase.from('wishes').insert({
        couple_id: p.coupleId, place_id: p.placeId, user_id: p.myId,
        created_by: p.myId, updated_by: p.myId,
      })
      if (error) throw new Error(error.message)
      return 'ok'
    }
    case 'event.create': {
      const p = entry.payload as EventCreatePayload
      const e = p.event
      // 재생 안전: 같은 시작시각·제목의 살아있는 일정이 이미 있으면 no-op(중복 생성 방지).
      const { data: dup } = await supabase
        .from('events').select('id').eq('couple_id', p.coupleId)
        .eq('start', e.start).eq('title', e.title).is('deleted_at', null).limit(1)
      if (dup && dup.length > 0) return 'ok'
      const { error } = await supabase.from('events').insert({
        couple_id: p.coupleId, title: e.title, start: e.start, end: e.end,
        is_all_day: e.isAllDay, time_zone: e.timeZone, visibility: e.visibility,
        participants: 'BOTH', owner_id: p.myId, place_id: e.placeId ?? null,
        memo: e.memo ?? null, recurrence_rule: e.recurrenceRule ?? null,
        reminders: e.reminders ?? [], created_by: p.myId, updated_by: p.myId,
      })
      if (error) throw new Error(error.message)
      return 'ok'
    }
    case 'event.update': {
      // 큐에 담을 때의 version으로 재생 — 그 사이 상대가 고쳤으면 conflict로 보고된다(LWW 금지).
      const p = entry.payload as EventUpdatePayload
      return (await versionedUpdate('events', p.id, p.expectedVersion, { ...p.patch, updated_by: p.myId })).status
    }
    default: {
      const m = /^([a-z_]+)\.(delete|restore)$/.exec(entry.kind)
      const table = m ? TRASH_TABLE_BY_TOKEN[m[1]!] : undefined
      if (m && table) {
        const p = entry.payload as VersionedTargetPayload
        const fn = m[2] === 'delete' ? softDelete : restore
        return (await fn(table, p.id, p.expectedVersion, p.myId)).status
      }
      return 'ok' // 진짜 미지의 종류 — 무시+제거
    }
  }
}
