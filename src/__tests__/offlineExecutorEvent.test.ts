import { describe, it, expect, vi, beforeEach } from 'vitest'

// event.create / event.update 재생(D2) — 일정 쓰기가 오프라인 큐를 타게 되면서 추가된 경로.
// 예전엔 useEventMutations에 enqueue가 0건이라 이동 중 적은 일정이 조용히 사라졌다.
const h = vi.hoisted(() => {
  const state: { selectResult: { data: unknown[] | null } } = { selectResult: { data: [] } }
  const inserted: unknown[] = []
  const versionedUpdate = vi.fn(async () => ({ status: 'ok' }) as { status: 'ok' | 'conflict' })
  const q: Record<string, unknown> = {}
  q.select = vi.fn(() => q)
  q.eq = vi.fn(() => q)
  q.is = vi.fn(() => q)
  q.limit = vi.fn(() => Promise.resolve(state.selectResult)) // 체인 종단
  q.insert = vi.fn((row: unknown) => {
    inserted.push(row)
    return Promise.resolve({ error: null })
  })
  return { state, inserted, versionedUpdate, q }
})

vi.mock('@/lib/supabase/client', () => ({ supabase: { from: vi.fn(() => h.q) } }))
vi.mock('@/lib/sync/versionedUpdate', async (orig) => {
  const real = await orig<typeof import('@/lib/sync/versionedUpdate')>()
  return { ...real, versionedUpdate: h.versionedUpdate }
})

import { executeOutbox } from '@/state/offlineExecutor'
import type { OutboxEntry } from '@/state/outboxStore'

const EVENT = {
  title: '숙소 예약하기',
  start: '2026-07-25T01:00:00.000Z',
  end: '2026-07-25T02:00:00.000Z',
  isAllDay: false,
  timeZone: 'Asia/Seoul',
  visibility: 'SHARED' as const,
}

const createEntry = (): OutboxEntry => ({
  id: 'o1',
  kind: 'event.create',
  payload: { coupleId: 'c1', myId: 'u1', event: EVENT },
  createdAt: 1,
})

const updateEntry = (): OutboxEntry => ({
  id: 'o2',
  kind: 'event.update',
  payload: { id: 'e1', expectedVersion: 3, patch: { title: '고친 제목' }, myId: 'u1' },
  createdAt: 1,
})

beforeEach(() => {
  h.state.selectResult = { data: [] }
  h.inserted.length = 0
  h.versionedUpdate.mockClear().mockResolvedValue({ status: 'ok' })
})

describe('offlineExecutor event.create', () => {
  it('없으면 insert하고 소유자·감사필드를 큐 주인으로 채운다', async () => {
    const outcome = await executeOutbox(createEntry())
    expect(outcome).toBe('ok')
    expect(h.inserted).toHaveLength(1)
    expect(h.inserted[0]).toMatchObject({
      couple_id: 'c1',
      title: '숙소 예약하기',
      owner_id: 'u1',
      created_by: 'u1',
      visibility: 'SHARED',
    })
  })

  it('같은 시작·제목이 이미 있으면 재삽입하지 않는다 — 재생 안전(중복 생성 방지)', async () => {
    h.state.selectResult = { data: [{ id: 'already' }] }
    const outcome = await executeOutbox(createEntry())
    expect(outcome).toBe('ok')
    expect(h.inserted).toHaveLength(0)
  })
})

describe('offlineExecutor event.update', () => {
  it('큐에 담을 때의 version으로 재생한다', async () => {
    const outcome = await executeOutbox(updateEntry())
    expect(outcome).toBe('ok')
    expect(h.versionedUpdate).toHaveBeenCalledWith(
      'events',
      'e1',
      3,
      expect.objectContaining({ title: '고친 제목', updated_by: 'u1' }),
    )
  })

  it('그 사이 상대가 고쳤으면 conflict를 그대로 보고한다 — 조용히 덮어쓰지 않는다(§4.3)', async () => {
    h.versionedUpdate.mockResolvedValue({ status: 'conflict' })
    expect(await executeOutbox(updateEntry())).toBe('conflict')
  })
})
