import { describe, it, expect, vi, beforeEach } from 'vitest'

// useTrash는 6개 TrashKind('places'|'events'|'visits'|'photos'|'trips'|'itineraries')에 대해
// `${table}.delete`/`${table}.restore`로 enqueue한다. offlineExecutor가 명시 케이스만 갖고 있으면
// event.delete·visits/photos/trips/itineraries의 delete/restore가 default로 새서('ok'로 무음 드롭)
// → 오프라인 휴지통 작업 유실(유실 0 위반). default 정규식이 TRASH_TABLES 전부를 처리함을 못박는다.
const h = vi.hoisted(() => {
  const softDelete = vi.fn(async () => ({ status: 'ok' }) as { status: 'ok' | 'conflict' })
  const restore = vi.fn(async () => ({ status: 'ok' }) as { status: 'ok' | 'conflict' })
  return { softDelete, restore }
})

vi.mock('@/lib/sync/versionedUpdate', async (orig) => {
  const real = await orig<typeof import('@/lib/sync/versionedUpdate')>()
  return { ...real, softDelete: h.softDelete, restore: h.restore }
})

import { executeOutbox } from '@/state/offlineExecutor'
import type { OutboxEntry } from '@/state/outboxStore'

function entry(kind: string): OutboxEntry {
  return {
    id: 'o1',
    kind,
    payload: { id: 'x1', expectedVersion: 3, myId: 'u1' },
    createdAt: 1,
  }
}

beforeEach(() => {
  h.softDelete.mockClear()
  h.restore.mockClear()
  h.softDelete.mockResolvedValue({ status: 'ok' })
  h.restore.mockResolvedValue({ status: 'ok' })
})

describe('offlineExecutor trash delete/restore 일반화 (flush 재생)', () => {
  it('trips.delete → softDelete("trips", id, expectedVersion, myId) + outcome=ok', async () => {
    const outcome = await executeOutbox(entry('trips.delete'))
    expect(h.softDelete).toHaveBeenCalledWith('trips', 'x1', 3, 'u1')
    expect(h.restore).not.toHaveBeenCalled()
    expect(outcome).toBe('ok')
  })

  it('visits.restore → restore("visits", id, expectedVersion, myId) + outcome=ok', async () => {
    const outcome = await executeOutbox(entry('visits.restore'))
    expect(h.restore).toHaveBeenCalledWith('visits', 'x1', 3, 'u1')
    expect(h.softDelete).not.toHaveBeenCalled()
    expect(outcome).toBe('ok')
  })

  it('itineraries.delete → softDelete("itineraries", ...)', async () => {
    const outcome = await executeOutbox(entry('itineraries.delete'))
    expect(h.softDelete).toHaveBeenCalledWith('itineraries', 'x1', 3, 'u1')
    expect(outcome).toBe('ok')
  })

  it('photos.restore → restore("photos", ...)', async () => {
    const outcome = await executeOutbox(entry('photos.restore'))
    expect(h.restore).toHaveBeenCalledWith('photos', 'x1', 3, 'u1')
    expect(outcome).toBe('ok')
  })

  it('event.delete(누락됐던 케이스)도 softDelete("events", ...)', async () => {
    const outcome = await executeOutbox(entry('events.delete'))
    expect(h.softDelete).toHaveBeenCalledWith('events', 'x1', 3, 'u1')
    expect(outcome).toBe('ok')
  })

  it('softDelete가 conflict면 outcome=conflict(무음 드롭 금지)', async () => {
    h.softDelete.mockResolvedValue({ status: 'conflict' })
    const outcome = await executeOutbox(entry('photos.delete'))
    expect(h.softDelete).toHaveBeenCalledWith('photos', 'x1', 3, 'u1')
    expect(outcome).toBe('conflict')
  })

  it('restore가 conflict면 outcome=conflict', async () => {
    h.restore.mockResolvedValue({ status: 'conflict' })
    const outcome = await executeOutbox(entry('trips.restore'))
    expect(outcome).toBe('conflict')
  })

  it('미허용 테이블(evil.delete)은 outcome=ok(무시) + softDelete/restore 미호출', async () => {
    const outcome = await executeOutbox(entry('evil.delete'))
    expect(h.softDelete).not.toHaveBeenCalled()
    expect(h.restore).not.toHaveBeenCalled()
    expect(outcome).toBe('ok')
  })

  // 레거시 단수 alias(usePlaceTrash/useRestoreEvent가 실제 enqueue 중) — plural 테이블로 매핑되어 재생.
  it('레거시 place.delete → softDelete("places", ...) (단수 alias 매핑, 유실 0)', async () => {
    const outcome = await executeOutbox(entry('place.delete'))
    expect(h.softDelete).toHaveBeenCalledWith('places', 'x1', 3, 'u1')
    expect(outcome).toBe('ok')
  })

  it('레거시 event.restore → restore("events", ...) (단수 alias 매핑)', async () => {
    const outcome = await executeOutbox(entry('event.restore'))
    expect(h.restore).toHaveBeenCalledWith('events', 'x1', 3, 'u1')
    expect(outcome).toBe('ok')
  })
})
