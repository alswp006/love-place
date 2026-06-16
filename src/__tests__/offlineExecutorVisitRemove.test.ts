import { describe, it, expect, vi, beforeEach } from 'vitest'

// visit.remove flush(재연결 재생)는 스냅샷에 의존하지 않고 placeId로 살아있는 방문행을 재조회한 뒤
// 각각 version 조건부 softDelete해야 한다. 옛 핸들러는 payload.visits를 순회 → undefined로 무동작('가짜 성공').
// 새 payload는 { placeId, myId, coupleId } — flush 시점 재조회로 재생 안전(no-op/충돌까지 보고).
const h = vi.hoisted(() => {
  const state: { selectResult: { data: unknown[] | null; error: { message: string } | null } } = {
    selectResult: { data: [], error: null },
  }
  const softDelete = vi.fn(async () => ({ status: 'ok' }) as { status: 'ok' | 'conflict' })
  const eqCalls: Array<[string, unknown]> = []
  const q: Record<string, unknown> = {}
  q.select = vi.fn(() => q)
  q.eq = vi.fn((col: string, val: unknown) => {
    eqCalls.push([col, val])
    return q
  })
  q.is = vi.fn(() => Promise.resolve(state.selectResult)) // 체인 종단(deleted_at IS NULL)
  return { state, softDelete, eqCalls, q }
})

vi.mock('@/lib/supabase/client', () => ({ supabase: { from: vi.fn(() => h.q) } }))
vi.mock('@/lib/sync/versionedUpdate', async (orig) => {
  const real = await orig<typeof import('@/lib/sync/versionedUpdate')>()
  return { ...real, softDelete: h.softDelete }
})

import { executeOutbox } from '@/state/offlineExecutor'
import type { OutboxEntry } from '@/state/outboxStore'

function entry(): OutboxEntry {
  return {
    id: 'e1',
    kind: 'visit.remove',
    payload: { placeId: 'p1', myId: 'u1', coupleId: 'c1' },
    createdAt: 1,
  }
}

beforeEach(() => {
  h.state.selectResult = { data: [], error: null }
  h.softDelete.mockClear()
  h.softDelete.mockResolvedValue({ status: 'ok' })
  h.eqCalls.length = 0
})

describe('offlineExecutor visit.remove (flush 재조회)', () => {
  it('placeId로 살아있는 방문행을 재조회한 뒤 각 행을 softDelete → ok', async () => {
    h.state.selectResult = { data: [{ id: 'v1', version: 1 }, { id: 'v2', version: 4 }], error: null }
    const outcome = await executeOutbox(entry())
    // (a) 재조회 필터: couple_id + place_id (deleted_at IS NULL은 .is() 종단으로 보장)
    expect(h.eqCalls).toContainEqual(['couple_id', 'c1'])
    expect(h.eqCalls).toContainEqual(['place_id', 'p1'])
    // (b) 반환된 행마다 softDelete 1회(myId 전달)
    expect(h.softDelete).toHaveBeenCalledTimes(2)
    expect(h.softDelete).toHaveBeenCalledWith('visits', 'v1', 1, 'u1')
    expect(h.softDelete).toHaveBeenCalledWith('visits', 'v2', 4, 'u1')
    // (c) 결과 ok
    expect(outcome).toBe('ok')
  })

  it('살아있는 행이 없으면 softDelete 미호출 → ok(이미 취소됨, 재생 안전)', async () => {
    h.state.selectResult = { data: [], error: null }
    const outcome = await executeOutbox(entry())
    expect(h.softDelete).not.toHaveBeenCalled()
    expect(outcome).toBe('ok')
  })

  it('softDelete 하나라도 conflict면 outcome=conflict', async () => {
    h.state.selectResult = { data: [{ id: 'v1', version: 1 }], error: null }
    h.softDelete.mockResolvedValue({ status: 'conflict' })
    const outcome = await executeOutbox(entry())
    expect(outcome).toBe('conflict')
  })
})
