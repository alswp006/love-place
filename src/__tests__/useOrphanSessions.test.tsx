import { describe, it, expect, vi, beforeEach } from 'vitest'

// useOrphanSessions(미연결 동선 목록) + useLinkSessionToTrip(여행 연결, 낙관적 락).
const h = vi.hoisted(() => {
  type Res = { data: unknown; error: { message: string } | null }
  const state: { results: Res[]; fromCalls: string[] } = { results: [], fromCalls: [] }
  const versionedUpdate = vi.fn(async () => ({ status: 'ok', row: {} }) as { status: 'ok' | 'conflict'; row?: unknown })
  function makeBuilder() {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'is', 'eq', 'gt', 'order']) q[m] = vi.fn(() => q)
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

import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useOrphanSessions, useLinkSessionToTrip } from '@/hooks/useOrphanSessions'
import { ConflictError } from '@/lib/sync/versionedUpdate'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  h.state.results = []
  h.state.fromCalls = []
  h.versionedUpdate.mockReset().mockResolvedValue({ status: 'ok', row: {} })
})

describe('useOrphanSessions', () => {
  it('미연결 DONE 세션을 [orphan-sessions, coupleId]로 조회', async () => {
    h.state.results = [{ data: [{ id: 's1', trip_id: null, status: 'DONE', version: 1 }], error: null }]
    const { result } = renderHook(() => useOrphanSessions('c1'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(h.state.fromCalls).toContain('trip_sessions')
  })

  it('coupleId 없으면 비활성', () => {
    const { result } = renderHook(() => useOrphanSessions(null), { wrapper: wrapper() })
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('useLinkSessionToTrip (낙관적 락)', () => {
  it('trip_id 지정 update 성공', async () => {
    const { result } = renderHook(() => useLinkSessionToTrip('c1', 'u1'), { wrapper: wrapper() })
    await act(async () => {
      await result.current.link({ id: 's1', version: 2, tripId: 't9' })
    })
    expect(h.versionedUpdate).toHaveBeenCalledWith('trip_sessions', 's1', 2, {
      trip_id: 't9',
      updated_by: 'u1',
    })
  })

  it('0행(conflict) → ConflictError(LWW 금지)', async () => {
    h.versionedUpdate.mockResolvedValue({ status: 'conflict' })
    const { result } = renderHook(() => useLinkSessionToTrip('c1', 'u1'), { wrapper: wrapper() })
    await act(async () => {
      await expect(result.current.link({ id: 's1', version: 2, tripId: 't9' })).rejects.toBeInstanceOf(
        ConflictError,
      )
    })
  })
})
