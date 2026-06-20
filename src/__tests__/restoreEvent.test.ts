import { describe, it, expect, vi, beforeEach } from 'vitest'

// useRestoreEvent(R1.5): 휴지통 복구를 일정(events)에 일반화한 restore('events', id, expectedVersion, myId).
// 0행 반환(서버 version↑) = 충돌 → onConflict(LWW 무음 덮어쓰기 금지). 온라인이면 restore, 오프라인이면 enqueue.
// onSettled에서 ['events', coupleId] 무효화로 캘린더 갱신.
const h = vi.hoisted(() => {
  const enqueue = vi.fn(async () => {})
  const restore = vi.fn(async () => ({ status: 'ok' }) as { status: 'ok' | 'conflict' })
  return { enqueue, restore }
})

vi.mock('@/lib/sync/versionedUpdate', async (orig) => {
  const real = await orig<typeof import('@/lib/sync/versionedUpdate')>()
  return { ...real, restore: h.restore }
})
vi.mock('@/state/OfflineQueueProvider', () => ({
  useOfflineQueue: () => ({ enqueue: h.enqueue }),
}))

import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useRestoreEvent } from '@/hooks/useRestoreEvent'

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
  return { qc, invalidate, wrapper }
}

beforeEach(() => {
  h.enqueue.mockClear()
  h.restore.mockClear()
  h.restore.mockResolvedValue({ status: 'ok' })
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true })
})

describe('useRestoreEvent (일정 복구 — restore events, 낙관적 락)', () => {
  it('온라인: restore("events", id, expectedVersion, myId) 호출 + ["events", coupleId] 무효화', async () => {
    const onConflict = vi.fn()
    const { invalidate, wrapper } = makeWrapper()
    const { result } = renderHook(() => useRestoreEvent('c1', 'u1', onConflict), { wrapper })
    await act(async () => {
      result.current.restoreEvent({ id: 'e1', expectedVersion: 3 })
    })
    expect(h.restore).toHaveBeenCalledWith('events', 'e1', 3, 'u1')
    expect(h.enqueue).not.toHaveBeenCalled()
    expect(onConflict).not.toHaveBeenCalled()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['events', 'c1'] })
  })

  it('충돌(restore가 conflict 반환) → onConflict 호출(무음 덮어쓰기 금지)', async () => {
    h.restore.mockResolvedValue({ status: 'conflict' })
    const onConflict = vi.fn()
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useRestoreEvent('c1', 'u1', onConflict), { wrapper })
    await act(async () => {
      result.current.restoreEvent({ id: 'e1', expectedVersion: 3 })
    })
    expect(onConflict).toHaveBeenCalledTimes(1)
  })

  it('오프라인: enqueue("event.restore", {id, expectedVersion, myId}, dedupe) — restore 미호출', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true, writable: true })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useRestoreEvent('c1', 'u1', vi.fn()), { wrapper })
    await act(async () => {
      result.current.restoreEvent({ id: 'e1', expectedVersion: 3 })
    })
    expect(h.enqueue).toHaveBeenCalledWith(
      'event.restore',
      { id: 'e1', expectedVersion: 3, myId: 'u1' },
      'event.restore:e1',
    )
    expect(h.restore).not.toHaveBeenCalled()
  })

  it('로그인 안 됨(myId=null) → restore/enqueue 미호출', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useRestoreEvent('c1', null, vi.fn()), { wrapper })
    await act(async () => {
      result.current.restoreEvent({ id: 'e1', expectedVersion: 3 })
    })
    expect(h.restore).not.toHaveBeenCalled()
    expect(h.enqueue).not.toHaveBeenCalled()
  })
})
