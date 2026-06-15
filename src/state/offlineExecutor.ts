import { versionedUpdate, softDelete, restore } from '@/lib/sync/versionedUpdate'
import { savePlace } from '@/lib/places/savePlace'
import { supabase } from '@/lib/supabase/client'
import type { KakaoPlaceHit } from '@/lib/kakao/types'
import type { OutboxEntry } from './outboxStore'
import type { FlushOutcome } from './offlineQueue'

// 아웃박스 항목 → 실제 Supabase op. 큐 매니저(offlineQueue)가 재연결 시 이 함수로 재생한다.
// 반환: 'ok'(적용) | 'conflict'(서버가 더 최신 — 제거+보고). 네트워크 오류는 throw → 큐가 잔류시키고 재시도.

export type OutboxKind =
  | 'wish.setPriority' | 'place.delete' | 'place.restore' | 'place.save'
  | 'visit.add' | 'visit.remove' | 'reaction.toggle'

type SetPriorityPayload = { wishId: string; expectedVersion: number; priority: number; myId: string }
type VersionedTargetPayload = { id: string; expectedVersion: number; myId: string }
type SavePayload = { coupleId: string; hit: KakaoPlaceHit; uid: string }
type VisitAddPayload = { coupleId: string; placeId: string; visitDate: string; myId: string }
type VisitRemovePayload = { visits: { id: string; version: number }[]; myId: string }
type ReactionTogglePayload = { coupleId: string; placeId: string; myId: string }

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
    case 'place.delete': {
      const p = entry.payload as VersionedTargetPayload
      return (await softDelete('places', p.id, p.expectedVersion, p.myId)).status
    }
    case 'place.restore': {
      const p = entry.payload as VersionedTargetPayload
      return (await restore('places', p.id, p.expectedVersion, p.myId)).status
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
      let conflicted = false
      for (const v of p.visits) {
        const r = await softDelete('visits', v.id, v.version, p.myId)
        if (r.status === 'conflict') conflicted = true
      }
      return conflicted ? 'conflict' : 'ok'
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
    default:
      return 'ok' // 알 수 없는 종류 — 무시하고 제거
  }
}
