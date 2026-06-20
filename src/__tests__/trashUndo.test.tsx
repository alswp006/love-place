import { describe, it, expect, vi, beforeEach } from 'vitest'

// Task 18: 삭제 즉시 '되돌리기' Undo(R1.5 토스트 패턴) — 방문·여행 신규 + 일정 공용 헬퍼로 통합.
// useSoftDeleteWithUndo(kind, coupleId, myId, onConflict)는:
//  - 성공 시 toast.show({ message, action:{ label:'되돌리기', onClick } }) — Undo 토스트(6초).
//  - 되돌리기 onClick → restore(table, id, expectedVersion+1, myId)로 복구(삭제로 +1된 버전, §4.3).
//  - 삭제 충돌(0행) → onConflict() (토스트 없음; LWW 무음 덮어쓰기 금지).
//  - kind 파라미터화로 일반화(여행/방문/일정 한 구현). 메시지는 kind 라벨/커스텀으로.

const h = vi.hoisted(() => {
  const softDelete = vi.fn(async () => ({ status: 'ok' }) as { status: 'ok' | 'conflict' })
  const restore = vi.fn(async () => ({ status: 'ok' }) as { status: 'ok' | 'conflict' })
  const enqueue = vi.fn(async () => {})
  const toastShow = vi.fn()
  return { softDelete, restore, enqueue, toastShow }
})

vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: vi.fn() },
  isSupabaseConfigured: true,
}))
vi.mock('@/lib/sync/versionedUpdate', async (orig) => {
  const real = await orig<typeof import('@/lib/sync/versionedUpdate')>()
  return { ...real, softDelete: h.softDelete, restore: h.restore }
})
vi.mock('@/state/OfflineQueueProvider', () => ({
  useOfflineQueue: () => ({ enqueue: h.enqueue }),
}))
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ show: h.toastShow }),
}))

import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useSoftDeleteWithUndo } from '@/hooks/useTrash'

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
  return { qc, wrapper }
}

beforeEach(() => {
  h.softDelete.mockClear()
  h.restore.mockClear()
  h.enqueue.mockClear()
  h.toastShow.mockClear()
  h.softDelete.mockResolvedValue({ status: 'ok' })
  h.restore.mockResolvedValue({ status: 'ok' })
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true })
})

describe('useSoftDeleteWithUndo — 삭제 즉시 되돌리기(R1.5)', () => {
  it('여행 삭제 성공 → softDelete(trips) + Undo 토스트(되돌리기)', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSoftDeleteWithUndo('trips', 'c1', 'u1', vi.fn()),
      { wrapper },
    )
    await act(async () => {
      await result.current.deleteWithUndo({ id: 't1', expectedVersion: 2 })
    })
    expect(h.softDelete).toHaveBeenCalledWith('trips', 't1', 2, 'u1')
    expect(h.toastShow).toHaveBeenCalledTimes(1)
    const arg = h.toastShow.mock.calls[0]![0] as {
      message: string
      action: { label: string; onClick: () => void }
    }
    expect(arg.message).toBe('여행을 삭제했어요')
    expect(arg.action.label).toBe('되돌리기')
  })

  it('되돌리기 onClick → restore(trips, id, version+1, myId)', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSoftDeleteWithUndo('trips', 'c1', 'u1', vi.fn()),
      { wrapper },
    )
    await act(async () => {
      await result.current.deleteWithUndo({ id: 't1', expectedVersion: 2 })
    })
    const arg = h.toastShow.mock.calls[0]![0] as { action: { onClick: () => void } }
    await act(async () => {
      arg.action.onClick()
    })
    expect(h.restore).toHaveBeenCalledWith('trips', 't1', 3, 'u1')
  })

  it('삭제 충돌(0행) → onConflict, 토스트 없음(LWW 금지)', async () => {
    h.softDelete.mockResolvedValue({ status: 'conflict' })
    const onConflict = vi.fn()
    const { wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSoftDeleteWithUndo('trips', 'c1', 'u1', onConflict),
      { wrapper },
    )
    await act(async () => {
      await result.current.deleteWithUndo({ id: 't1', expectedVersion: 2 })
    })
    expect(onConflict).toHaveBeenCalledTimes(1)
    expect(h.toastShow).not.toHaveBeenCalled()
  })

  it('kind 파라미터화 — 방문(visits)은 visits 테이블 + 커스텀 메시지', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSoftDeleteWithUndo('visits', 'c1', 'u1', vi.fn()),
      { wrapper },
    )
    await act(async () => {
      await result.current.deleteWithUndo({
        id: 'v1',
        expectedVersion: 1,
        message: '가봤음을 취소했어요',
      })
    })
    expect(h.softDelete).toHaveBeenCalledWith('visits', 'v1', 1, 'u1')
    const arg = h.toastShow.mock.calls[0]![0] as { message: string }
    expect(arg.message).toBe('가봤음을 취소했어요')
  })
})
