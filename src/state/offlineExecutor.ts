import { versionedUpdate, softDelete, restore } from '@/lib/sync/versionedUpdate'
import { savePlace } from '@/lib/places/savePlace'
import type { KakaoPlaceHit } from '@/lib/kakao/types'
import type { OutboxEntry } from './outboxStore'
import type { FlushOutcome } from './offlineQueue'

// 아웃박스 항목 → 실제 Supabase op. 큐 매니저(offlineQueue)가 재연결 시 이 함수로 재생한다.
// 반환: 'ok'(적용) | 'conflict'(서버가 더 최신 — 제거+보고). 네트워크 오류는 throw → 큐가 잔류시키고 재시도.

export type OutboxKind = 'wish.setPriority' | 'place.delete' | 'place.restore' | 'place.save'

type SetPriorityPayload = { wishId: string; expectedVersion: number; priority: number; myId: string }
type VersionedTargetPayload = { id: string; expectedVersion: number; myId: string }
type SavePayload = { coupleId: string; hit: KakaoPlaceHit; uid: string }

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
    default:
      return 'ok' // 알 수 없는 종류 — 무시하고 제거
  }
}
