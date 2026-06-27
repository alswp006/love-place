import { describe, it, expect, vi, beforeEach } from 'vitest'

// useRecordedRoute — get_session_points RPC(복호) → 정렬·단순화·실측거리. realtime(trip_sessions) 무효화.
const h = vi.hoisted(() => {
  const rpc = vi.fn()
  const subscribe = vi.fn(() => ({}))
  const on = vi.fn(() => ({ subscribe }))
  const channel = vi.fn(() => ({ on }))
  const removeChannel = vi.fn()
  return { rpc, channel, on, subscribe, removeChannel }
})
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: h.rpc, channel: h.channel, removeChannel: h.removeChannel },
}))

import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useRecordedRoute } from '@/hooks/useRecordedRoute'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  h.rpc.mockReset()
  h.channel.mockClear()
  h.removeChannel.mockClear()
})

describe('useRecordedRoute', () => {
  it('RPC 점을 시간순 정렬 + 폴리라인 도출', async () => {
    h.rpc.mockResolvedValue({
      data: [
        { recorded_at: '2026-06-01T10:02:00Z', lat: 37.52, lng: 127, accuracy_m: 5 },
        { recorded_at: '2026-06-01T10:00:00Z', lat: 37.5, lng: 127, accuracy_m: 5 },
        { recorded_at: '2026-06-01T10:01:00Z', lat: 37.51, lng: 127, accuracy_m: 5 },
      ],
      error: null,
    })
    const { result } = renderHook(() => useRecordedRoute('c1', 's1'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.points.map((p) => p.recorded_at)).toEqual([
      '2026-06-01T10:00:00Z',
      '2026-06-01T10:01:00Z',
      '2026-06-01T10:02:00Z',
    ])
    expect(result.current.polyline.length).toBeGreaterThanOrEqual(2)
    expect(result.current.distanceKm).toBeGreaterThan(0)
    expect(h.rpc).toHaveBeenCalledWith('get_session_points', { p_session: 's1' })
  })

  it('점 없으면 빈 동선', async () => {
    h.rpc.mockResolvedValue({ data: [], error: null })
    const { result } = renderHook(() => useRecordedRoute('c1', 's1'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.points).toHaveLength(0)
    expect(result.current.polyline).toHaveLength(0)
    expect(result.current.distanceKm).toBe(0)
  })

  it('realtime 채널 구독 + 언마운트 시 cleanup', async () => {
    h.rpc.mockResolvedValue({ data: [], error: null })
    const { unmount } = renderHook(() => useRecordedRoute('c1', 's1'), { wrapper: wrapper() })
    await waitFor(() => expect(h.channel).toHaveBeenCalled())
    expect(h.on).toHaveBeenCalled()
    unmount()
    expect(h.removeChannel).toHaveBeenCalled()
  })

  it('sessionId 없으면 쿼리 비활성·채널 없음', () => {
    const { result } = renderHook(() => useRecordedRoute('c1', null), { wrapper: wrapper() })
    expect(result.current.points).toHaveLength(0)
    expect(h.channel).not.toHaveBeenCalled()
  })
})
