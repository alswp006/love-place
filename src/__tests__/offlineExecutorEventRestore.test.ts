import { describe, it, expect, vi, beforeEach } from 'vitest'

// event.restore flush(재연결 재생)는 payload {id, expectedVersion, myId}로 restore('events', ...)를 호출하고
// 그 status를 그대로 outcome으로 돌려줘야 한다. event.restore 케이스가 없으면 default 분기로 새서('ok'로 무음 드롭)
// → R1.5 Undo가 조용히 실패한다. 그 계약을 못박는다(ok/conflict 모두).
const h = vi.hoisted(() => {
  const restore = vi.fn(async () => ({ status: 'ok' }) as { status: 'ok' | 'conflict' })
  return { restore }
})

vi.mock('@/lib/sync/versionedUpdate', async (orig) => {
  const real = await orig<typeof import('@/lib/sync/versionedUpdate')>()
  return { ...real, restore: h.restore }
})

import { executeOutbox } from '@/state/offlineExecutor'
import type { OutboxEntry } from '@/state/outboxStore'

function entry(): OutboxEntry {
  return {
    id: 'o1',
    kind: 'event.restore',
    payload: { id: 'e1', expectedVersion: 3, myId: 'u1' },
    createdAt: 1,
  }
}

beforeEach(() => {
  h.restore.mockClear()
  h.restore.mockResolvedValue({ status: 'ok' })
})

describe('offlineExecutor event.restore (flush 재생)', () => {
  it('restore("events", id, expectedVersion, myId) 호출 + outcome=ok', async () => {
    const outcome = await executeOutbox(entry())
    expect(h.restore).toHaveBeenCalledWith('events', 'e1', 3, 'u1')
    expect(outcome).toBe('ok')
  })

  it('restore가 conflict면 outcome=conflict(무음 드롭 금지)', async () => {
    h.restore.mockResolvedValue({ status: 'conflict' })
    const outcome = await executeOutbox(entry())
    expect(h.restore).toHaveBeenCalledWith('events', 'e1', 3, 'u1')
    expect(outcome).toBe('conflict')
  })
})
