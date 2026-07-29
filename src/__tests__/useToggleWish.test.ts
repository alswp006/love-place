import { describe, it, expect, vi, beforeEach } from 'vitest'

// '나도 찜' / '찜 해제' 토글 — 상대가 담은 장소에 내 의도를 더하는 유일한 경로.
// 계약: insert(upsert 아님 — 부분 유니크라 42P10 위험) / 해제는 version 조건부 soft-delete(LWW 금지).
const insert = vi.fn()
const softDelete = vi.fn()
const enqueue = vi.fn()
const selectResult = { rows: [] as { id: string; version: number }[] }

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({ is: () => ({ limit: () => ({ data: selectResult.rows, error: null }) }) }),
          }),
        }),
      }),
      insert: (...a: unknown[]) => {
        insert(...a)
        return { error: null }
      },
    }),
  },
}))
vi.mock('@/lib/sync/versionedUpdate', () => ({ softDelete: (...a: unknown[]) => softDelete(...a) }))
vi.mock('@/state/OfflineQueueProvider', () => ({ useOfflineQueue: () => ({ enqueue }) }))

import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useToggleWish } from '@/hooks/useToggleWish'

function wrap() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  insert.mockReset()
  enqueue.mockReset()
  softDelete.mockReset().mockResolvedValue({ status: 'ok', row: {} })
  selectResult.rows = []
  vi.stubGlobal('navigator', { onLine: true })
})

describe('useToggleWish', () => {
  it('내 wish가 없으면 insert — upsert를 쓰지 않는다(부분 유니크 42P10 회피)', async () => {
    const { result } = renderHook(() => useToggleWish('c1', 'me', vi.fn()), { wrapper: wrap() })
    await act(async () => {
      await result.current.mutateAsync({ placeId: 'p1' })
    })
    expect(insert).toHaveBeenCalledOnce()
    expect(insert.mock.calls[0]![0]).toMatchObject({
      couple_id: 'c1',
      place_id: 'p1',
      user_id: 'me',
      created_by: 'me',
    })
    expect(softDelete).not.toHaveBeenCalled()
  })

  it('내 wish가 있으면 version 조건부 soft-delete(해제) — 물리 삭제 아님', async () => {
    selectResult.rows = [{ id: 'w1', version: 3 }]
    const { result } = renderHook(() => useToggleWish('c1', 'me', vi.fn()), { wrapper: wrap() })
    await act(async () => {
      await result.current.mutateAsync({ placeId: 'p1' })
    })
    expect(softDelete).toHaveBeenCalledWith('wishes', 'w1', 3, 'me')
    expect(insert).not.toHaveBeenCalled()
  })

  it('해제가 0행이면 조용히 넘어가지 않고 충돌을 알린다(§4.3)', async () => {
    selectResult.rows = [{ id: 'w1', version: 1 }]
    softDelete.mockResolvedValue({ status: 'conflict' })
    const onConflict = vi.fn()
    const { result } = renderHook(() => useToggleWish('c1', 'me', onConflict), { wrapper: wrap() })
    await act(async () => {
      await result.current.mutateAsync({ placeId: 'p1' })
    })
    expect(onConflict).toHaveBeenCalledOnce()
  })

  it('오프라인이면 큐에 적재하고 서버를 건드리지 않는다(재연결 시 그때 상태로 토글)', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { result } = renderHook(() => useToggleWish('c1', 'me', vi.fn()), { wrapper: wrap() })
    await act(async () => {
      await result.current.mutateAsync({ placeId: 'p1' })
    })
    expect(enqueue).toHaveBeenCalledWith(
      'wish.toggle',
      { coupleId: 'c1', placeId: 'p1', myId: 'me' },
      'wish.toggle:p1',
    )
    expect(insert).not.toHaveBeenCalled()
    expect(softDelete).not.toHaveBeenCalled()
  })

  it('미연결이면 안내 문구로 거부한다', async () => {
    const { result } = renderHook(() => useToggleWish(null, 'me', vi.fn()), { wrapper: wrap() })
    await expect(result.current.mutateAsync({ placeId: 'p1' })).rejects.toThrow(/연결/)
  })
})
