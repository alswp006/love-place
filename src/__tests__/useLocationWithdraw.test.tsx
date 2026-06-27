import { describe, it, expect, vi, beforeEach } from 'vitest'

// useLocationWithdraw — 철회=하드 파기. recorder.stop() 후 location-purge Edge Function 호출. 설계 §5[3][4].
const h = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ supabase: { functions: { invoke: h.invoke } }, isSupabaseConfigured: true }))

import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useLocationWithdraw } from '@/hooks/useLocationWithdraw'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => h.invoke.mockReset())

describe('useLocationWithdraw', () => {
  it('stop() 호출 후 location-purge Edge Function 호출', async () => {
    h.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    const stop = vi.fn(async () => {})
    const { result } = renderHook(() => useLocationWithdraw('c1'), { wrapper: wrapper() })
    await act(async () => {
      await result.current.withdraw({ sessionId: 's1', stop })
    })
    expect(stop).toHaveBeenCalledOnce()
    expect(h.invoke).toHaveBeenCalledWith('location-purge', { body: { sessionId: 's1' } })
  })

  it('stop 없이도(웹) 파기 호출', async () => {
    h.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    const { result } = renderHook(() => useLocationWithdraw('c1'), { wrapper: wrapper() })
    await act(async () => {
      await result.current.withdraw({ sessionId: 's1' })
    })
    expect(h.invoke).toHaveBeenCalledOnce()
  })

  it('Edge Function 에러 → throw', async () => {
    h.invoke.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { result } = renderHook(() => useLocationWithdraw('c1'), { wrapper: wrapper() })
    await act(async () => {
      await expect(result.current.withdraw({ sessionId: 's1' })).rejects.toThrow('boom')
    })
  })

  it('ok!==true → throw(무음 실패 금지)', async () => {
    h.invoke.mockResolvedValue({ data: { ok: false }, error: null })
    const { result } = renderHook(() => useLocationWithdraw('c1'), { wrapper: wrapper() })
    await act(async () => {
      await expect(result.current.withdraw({ sessionId: 's1' })).rejects.toThrow(/파기/)
    })
  })

  it('하드파기 후 복호 좌표 캐시를 evict한다(잔존 금지)', async () => {
    h.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    qc.setQueryData(['recorded-route', 'c1', 's1'], [{ recorded_at: 't', lat: 37.5, lng: 127.0 }])
    const w = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children)
    const { result } = renderHook(() => useLocationWithdraw('c1'), { wrapper: w })
    await act(async () => {
      await result.current.withdraw({ sessionId: 's1' })
    })
    expect(qc.getQueryData(['recorded-route', 'c1', 's1'])).toBeUndefined()
  })
})
