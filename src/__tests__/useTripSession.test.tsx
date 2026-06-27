import { describe, it, expect, vi, beforeEach } from 'vitest'

// useTripSession — 시작(동의 게이트)/일시중지/종료(낙관적 락). LWW 금지(0행=ConflictError).
const h = vi.hoisted(() => {
  type Res = { data: unknown; error: { message: string } | null }
  const state: { results: Res[]; fromCalls: string[]; insertArgs: unknown[] } = {
    results: [],
    fromCalls: [],
    insertArgs: [],
  }
  const versionedUpdate = vi.fn(async () => ({ status: 'ok', row: {} }) as { status: 'ok' | 'conflict'; row?: unknown })
  function makeBuilder() {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'insert', 'eq', 'is', 'in', 'order', 'limit']) {
      q[m] = vi.fn((...a: unknown[]) => {
        if (m === 'insert') state.insertArgs.push(a[0])
        return q
      })
    }
    q.single = vi.fn(() => Promise.resolve(state.results.shift() ?? { data: null, error: null }))
    q.then = (resolve: (v: Res) => unknown) => resolve(state.results.shift() ?? { data: [], error: null })
    return q
  }
  const from = vi.fn((t: string) => {
    state.fromCalls.push(t)
    return makeBuilder()
  })
  return { state, from, versionedUpdate }
})
vi.mock('@/lib/supabase/client', () => ({ supabase: { from: h.from }, isSupabaseConfigured: true }))
vi.mock('@/lib/sync/versionedUpdate', async (orig) => {
  const real = await orig<typeof import('@/lib/sync/versionedUpdate')>()
  return { ...real, versionedUpdate: h.versionedUpdate }
})

import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useTripSession } from '@/hooks/useTripSession'
import { ConflictError } from '@/lib/sync/versionedUpdate'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  h.state.results = []
  h.state.fromCalls = []
  h.state.insertArgs = []
  h.versionedUpdate.mockReset()
  h.versionedUpdate.mockResolvedValue({ status: 'ok', row: {} })
})

describe('useTripSession', () => {
  it('start: canRecord=false면 throw(동의 게이트)', async () => {
    const { result } = renderHook(() => useTripSession('c1', 'u1', 't1', { canRecord: false }), { wrapper: wrapper() })
    await act(async () => {
      await expect(result.current.start()).rejects.toThrow(/동의/)
    })
    expect(h.state.fromCalls).not.toContain('trip_sessions')
  })

  it('start: RECORDING 세션 insert(couple_id·owner_id·감사필드)', async () => {
    h.state.results = [{ data: { id: 's1' }, error: null }]
    const { result } = renderHook(() => useTripSession('c1', 'u1', 't1', { canRecord: true }), { wrapper: wrapper() })
    let id = ''
    await act(async () => {
      id = await result.current.start()
    })
    expect(id).toBe('s1')
    expect(h.state.insertArgs[0]).toMatchObject({
      couple_id: 'c1',
      trip_id: 't1',
      owner_id: 'u1',
      status: 'RECORDING',
      created_by: 'u1',
      updated_by: 'u1',
    })
  })

  it('pause: version 조건부 update(PAUSED)', async () => {
    const { result } = renderHook(() => useTripSession('c1', 'u1', 't1', { canRecord: true }), { wrapper: wrapper() })
    await act(async () => {
      await result.current.pause({ id: 's1', version: 1 })
    })
    expect(h.versionedUpdate).toHaveBeenCalledWith('trip_sessions', 's1', 1, {
      status: 'PAUSED',
      updated_by: 'u1',
    })
  })

  it('pause: 0행(conflict) → ConflictError(LWW 금지)', async () => {
    h.versionedUpdate.mockResolvedValue({ status: 'conflict' })
    const { result } = renderHook(() => useTripSession('c1', 'u1', 't1', { canRecord: true }), { wrapper: wrapper() })
    await act(async () => {
      await expect(result.current.pause({ id: 's1', version: 1 })).rejects.toBeInstanceOf(ConflictError)
    })
  })

  it('end: DONE + recorded_distance_m + ended_at', async () => {
    const { result } = renderHook(() => useTripSession('c1', 'u1', 't1', { canRecord: true }), { wrapper: wrapper() })
    await act(async () => {
      await result.current.end({ id: 's1', version: 2, recordedDistanceM: 4200 })
    })
    expect(h.versionedUpdate).toHaveBeenCalledWith(
      'trip_sessions',
      's1',
      2,
      expect.objectContaining({ status: 'DONE', recorded_distance_m: 4200, updated_by: 'u1' }),
    )
  })
})
