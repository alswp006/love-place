import { describe, it, expect, vi, beforeEach } from 'vitest'

// useConsent — 4종 동의(consent_log append-only). 기본 OFF, 최신행=현재상태, canRecord=세션 시작 게이트.
const h = vi.hoisted(() => {
  type Res = { data: unknown; error: { message: string } | null }
  const state: { results: Res[]; fromCalls: string[]; insertArgs: unknown[] } = {
    results: [],
    fromCalls: [],
    insertArgs: [],
  }
  function makeBuilder() {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'insert', 'eq', 'order']) {
      q[m] = vi.fn((...a: unknown[]) => {
        if (m === 'insert') state.insertArgs.push(a[0])
        return q
      })
    }
    q.then = (resolve: (v: Res) => unknown) => resolve(state.results.shift() ?? { data: [], error: null })
    return q
  }
  const from = vi.fn((t: string) => {
    state.fromCalls.push(t)
    return makeBuilder()
  })
  return { state, from }
})
vi.mock('@/lib/supabase/client', () => ({ supabase: { from: h.from }, isSupabaseConfigured: true }))

import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useConsent } from '@/hooks/useConsent'

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  h.state.results = []
  h.state.fromCalls = []
  h.state.insertArgs = []
})

describe('useConsent — 4종 동의', () => {
  it('빈 로그면 모든 동의 OFF(canRecord/canProvide false)', async () => {
    h.state.results = [{ data: [], error: null }]
    const { result } = renderHook(() => useConsent('c1', 'u1'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.canRecord).toBe(false)
    expect(result.current.canProvide).toBe(false)
    expect(result.current.notifyMode).toBe('IMMEDIATE')
  })

  it('최신 COLLECT_USE granted=true면 canRecord true', async () => {
    h.state.results = [
      {
        data: [{ consent_type: 'COLLECT_USE', scope: 'RECAP', granted: true, notify_mode: null, created_at: 't2' }],
        error: null,
      },
    ]
    const { result } = renderHook(() => useConsent('c1', 'u1'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.canRecord).toBe(true))
  })

  it('grant: insert 1행(granted=true, policy_version·shown_text_hash 포함)', async () => {
    const { result } = renderHook(() => useConsent('c1', 'u1'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => {
      await result.current.grant('COLLECT_USE', { scope: 'RECAP', shownTextHash: 'abc' })
    })
    expect(h.state.fromCalls).toContain('consent_log')
    expect(h.state.insertArgs[0]).toMatchObject({
      user_id: 'u1',
      couple_id: 'c1',
      consent_type: 'COLLECT_USE',
      granted: true,
      scope: 'RECAP',
      shown_text_hash: 'abc',
      created_by: 'u1',
    })
    expect((h.state.insertArgs[0] as { policy_version: string }).policy_version).toBeTruthy()
  })

  it('withdraw: insert granted=false + withdrawn_at', async () => {
    const { result } = renderHook(() => useConsent('c1', 'u1'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => {
      await result.current.withdraw('THIRD_PARTY_PROVIDE_PARTNER')
    })
    const arg = h.state.insertArgs[0] as { granted: boolean; withdrawn_at: string | null; granted_at: string | null }
    expect(arg.granted).toBe(false)
    expect(arg.withdrawn_at).toBeTruthy()
    expect(arg.granted_at).toBeNull()
  })
})
