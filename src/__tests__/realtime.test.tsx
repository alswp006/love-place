import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// Realtime 무효화(§5.1·web-stack §4.3) — postgres_changes 수신 시 관련 쿼리를 invalidate하고,
// 언마운트 시 removeChannel로 채널을 정리(누수 금지)하는지 검증. supabase.channel을 캡처형 모킹.
const handlers = vi.hoisted(() => [] as Array<() => void>)
const removeChannel = vi.hoisted(() => vi.fn())
const subscribe = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/client', () => {
  const make = () => {
    const ch: Record<string, unknown> = {}
    ch.on = (_evt: string, _cfg: unknown, cb: () => void) => {
      handlers.push(cb)
      return ch
    }
    ch.subscribe = () => {
      subscribe()
      return ch
    }
    return ch
  }
  return { isSupabaseConfigured: true, supabase: { channel: () => make(), removeChannel } }
})

import { useRealtimePlaces } from '@/hooks/useRealtimePlaces'
import { useRealtimeCollections } from '@/hooks/useRealtimeCollections'

function setup() {
  const qc = new QueryClient()
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return { invalidate, wrapper }
}

beforeEach(() => {
  handlers.length = 0
  removeChannel.mockClear()
  subscribe.mockClear()
})

describe('useRealtimePlaces — 무효화/정리', () => {
  it('places·wishes 변경 수신 시 해당 쿼리키를 무효화한다', () => {
    const { invalidate, wrapper } = setup()
    renderHook(() => useRealtimePlaces('c1'), { wrapper })
    expect(handlers.length).toBe(2) // places + wishes 핸들러
    handlers[0]!()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['places', 'c1'] })
    handlers[1]!()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['wishes', 'c1'] })
  })

  it('언마운트 시 removeChannel로 채널을 정리한다(누수 방지)', () => {
    const { wrapper } = setup()
    const { unmount } = renderHook(() => useRealtimePlaces('c1'), { wrapper })
    unmount()
    expect(removeChannel).toHaveBeenCalledTimes(1)
  })

  it('coupleId 없으면 구독하지 않는다', () => {
    const { wrapper } = setup()
    renderHook(() => useRealtimePlaces(null), { wrapper })
    expect(handlers.length).toBe(0)
    expect(subscribe).not.toHaveBeenCalled()
  })
})

describe('useRealtimeCollections — 무효화', () => {
  it('collections·place_collections 변경 수신 시 무효화한다', () => {
    const { invalidate, wrapper } = setup()
    renderHook(() => useRealtimeCollections('c1'), { wrapper })
    expect(handlers.length).toBe(2)
    handlers[0]!()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['collections', 'c1'] })
    handlers[1]!()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['place_collections', 'c1'] })
  })
})
