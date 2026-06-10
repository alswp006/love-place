import { describe, it, expect, beforeEach } from 'vitest'
import { interpretRows } from '@/lib/sync/versionedUpdate'

// supabase 쿼리 빌더 체인 모킹: from().update().eq().eq().is().select()
const h = vi.hoisted(() => {
  const state: {
    selectResult: { data: unknown[] | null; error: { message: string } | null }
    updateArg: Record<string, unknown> | null
    eqCalls: Array<[string, unknown]>
  } = { selectResult: { data: [], error: null }, updateArg: null, eqCalls: [] }
  const q: Record<string, unknown> = {}
  q.update = vi.fn((arg: Record<string, unknown>) => {
    state.updateArg = arg
    return q
  })
  q.eq = vi.fn((col: string, val: unknown) => {
    state.eqCalls.push([col, val])
    return q
  })
  q.is = vi.fn(() => q)
  q.not = vi.fn(() => q)
  q.select = vi.fn(() => Promise.resolve(state.selectResult))
  return { state, q }
})

vi.mock('@/lib/supabase/client', () => ({ supabase: { from: vi.fn(() => h.q) } }))

const { versionedUpdate, softDelete, restore } = await import('@/lib/sync/versionedUpdate')

describe('interpretRows (순수)', () => {
  it('0행 = 충돌', () => {
    expect(interpretRows([]).status).toBe('conflict')
  })
  it('1행 = 성공 + 그 행 반환', () => {
    const r = interpretRows([{ id: 'a' }])
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.row).toEqual({ id: 'a' })
  })
})

describe('versionedUpdate', () => {
  beforeEach(() => {
    h.state.updateArg = null
    h.state.eqCalls = []
    h.state.selectResult = { data: [], error: null }
  })

  it('version=expected+1을 보낸다 (DB 트리거 부재 — 앱이 명시 증가)', async () => {
    h.state.selectResult = { data: [{ id: 'x', version: 6 }], error: null }
    const res = await versionedUpdate('wishes', 'x', 5, { priority: 2, updated_by: 'me' })
    expect(h.state.updateArg).toMatchObject({ priority: 2, updated_by: 'me', version: 6 })
    expect(h.state.eqCalls).toContainEqual(['version', 5]) // 충돌 감지 조건
    expect(h.state.eqCalls).toContainEqual(['id', 'x'])
    expect(res.status).toBe('ok')
  })

  it('0행 반환 = 충돌 (LWW 무음 덮어쓰기 금지)', async () => {
    h.state.selectResult = { data: [], error: null }
    const res = await versionedUpdate('wishes', 'x', 5, { priority: 2 })
    expect(res.status).toBe('conflict')
  })

  it('supabase 오류는 throw', async () => {
    h.state.selectResult = { data: null, error: { message: 'boom' } }
    await expect(versionedUpdate('wishes', 'x', 5, { priority: 2 })).rejects.toThrow('boom')
  })
})

describe('softDelete (휴지통으로)', () => {
  beforeEach(() => {
    h.state.updateArg = null
    h.state.selectResult = { data: [], error: null }
  })

  it('deleted_at(타임스탬프)+version+1+updated_by를 보낸다', async () => {
    h.state.selectResult = { data: [{ id: 'p' }], error: null }
    const res = await softDelete('places', 'p', 3, 'me')
    expect(typeof h.state.updateArg?.deleted_at).toBe('string') // now() ISO
    expect(h.state.updateArg).toMatchObject({ version: 4, updated_by: 'me' })
    expect(res.status).toBe('ok')
  })

  it('0행 = 충돌(이미 삭제됐거나 version 불일치)', async () => {
    h.state.selectResult = { data: [], error: null }
    const res = await softDelete('places', 'p', 3, 'me')
    expect(res.status).toBe('conflict')
  })
})

describe('restore (복구)', () => {
  beforeEach(() => {
    h.state.updateArg = null
    h.state.selectResult = { data: [], error: null }
  })

  it('deleted_at=null + version+1을 보낸다', async () => {
    h.state.selectResult = { data: [{ id: 'p' }], error: null }
    const res = await restore('places', 'p', 7, 'me')
    expect(h.state.updateArg).toMatchObject({ deleted_at: null, version: 8, updated_by: 'me' })
    expect(res.status).toBe('ok')
  })
})
