import { describe, it, expect, vi, beforeEach } from 'vitest'
import { interpretRows } from '@/lib/sync/versionedUpdate'

// useUnmarkVisited는 stale-cache race를 피하려고 mutationFn에서 살아있는 방문행을 직접 재조회(id+version)한 뒤
// 각각 version 조건부 softDelete한다. 결과는 {status: removed|noop|conflict} — '무동작 성공' 제거(R1.2).
// 0행 반환(서버 version↑) = 충돌 → onConflict 호출(LWW 금지). 그 계약을 interpretRows로도 못박는다.
describe('가봤어요 토글 — 방문 취소 충돌 계약(순수)', () => {
  it('soft-delete가 1행을 돌려주면 ok(취소 성공)', () => {
    expect(interpretRows([{ id: 'v1' }]).status).toBe('ok')
  })
  it('soft-delete가 0행이면 conflict(상대가 먼저 수정/삭제) — 무음 덮어쓰기 금지', () => {
    expect(interpretRows([]).status).toBe('conflict')
  })
})

// ── 통합: 라이브 재조회 + {status} 반환 + 낙관적 토글/롤백 + 오프라인 enqueue 페이로드 ─────────────────
// from('visits').select('id, version').eq('couple_id', _).eq('place_id', _).is('deleted_at', null) 체인을 모킹.
const h = vi.hoisted(() => {
  const state: { selectResult: { data: unknown[] | null; error: { message: string } | null } } = {
    selectResult: { data: [], error: null },
  }
  const enqueue = vi.fn(async () => {})
  const softDelete = vi.fn(async () => ({ status: 'ok' }) as { status: 'ok' | 'conflict' })
  const q: Record<string, unknown> = {}
  q.select = vi.fn(() => q)
  q.eq = vi.fn(() => q)
  q.is = vi.fn(() => Promise.resolve(state.selectResult)) // 체인 종단(살아있는 방문행 조회)
  return { state, enqueue, softDelete, q }
})

vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: vi.fn(() => h.q) },
  isSupabaseConfigured: true,
}))
vi.mock('@/lib/sync/versionedUpdate', async (orig) => {
  const real = await orig<typeof import('@/lib/sync/versionedUpdate')>()
  return { ...real, softDelete: h.softDelete }
})
vi.mock('@/state/OfflineQueueProvider', () => ({
  useOfflineQueue: () => ({ enqueue: h.enqueue }),
}))
// Task 18: useUnmarkVisited가 removed 시 '되돌리기' Undo 토스트를 띄운다 → useToast 의존 추가.
// 여기선 status/캐시 동작만 검증하므로 토스트는 noop으로 mock(토스트 내용은 placeSheet/trashUndo 테스트가 담당).
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ show: vi.fn() }),
}))

import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useUnmarkVisited, type VisitRow } from '@/hooks/useVisits'

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
  return { qc, wrapper }
}

const aVisit = (over: Partial<VisitRow> = {}): VisitRow => ({
  id: 'v1',
  place_id: 'p1',
  trip_id: null,
  visit_date: null,
  rating: null,
  memo: null,
  version: 1,
  ...over,
})

beforeEach(() => {
  h.state.selectResult = { data: [], error: null }
  h.enqueue.mockClear()
  h.softDelete.mockClear()
  h.softDelete.mockResolvedValue({ status: 'ok' })
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true })
})

describe('useUnmarkVisited (라이브 재조회 → {status})', () => {
  it('활성 방문행 2개 → 모두 softDelete ok → {status: removed}', async () => {
    h.state.selectResult = { data: [{ id: 'v1', version: 1 }, { id: 'v2', version: 3 }], error: null }
    const onConflict = vi.fn()
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useUnmarkVisited('c1', 'u1', onConflict), { wrapper })
    let res: { status: string } | undefined
    await act(async () => {
      res = await result.current.mutateAsync({ placeId: 'p1' })
    })
    // Task 18: removed면 삭제한 행들의 id+삭제후버전(version+1)을 함께 돌려 Undo가 같은 행을 복구한다.
    expect(res).toEqual({ status: 'removed', deleted: [{ id: 'v1', version: 2 }, { id: 'v2', version: 4 }] })
    expect(h.softDelete).toHaveBeenCalledTimes(2)
    expect(h.softDelete).toHaveBeenCalledWith('visits', 'v1', 1, 'u1')
    expect(h.softDelete).toHaveBeenCalledWith('visits', 'v2', 3, 'u1')
    expect(onConflict).not.toHaveBeenCalled()
  })

  it('활성 방문행 0개 → softDelete 미호출 → {status: noop}', async () => {
    h.state.selectResult = { data: [], error: null }
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useUnmarkVisited('c1', 'u1', vi.fn()), { wrapper })
    let res: { status: string } | undefined
    await act(async () => {
      res = await result.current.mutateAsync({ placeId: 'p1' })
    })
    expect(res).toEqual({ status: 'noop' })
    expect(h.softDelete).not.toHaveBeenCalled()
  })

  it('softDelete가 conflict → {status: conflict} + onConflict 호출(무음 덮어쓰기 금지)', async () => {
    h.state.selectResult = { data: [{ id: 'v1', version: 1 }], error: null }
    h.softDelete.mockResolvedValue({ status: 'conflict' })
    const onConflict = vi.fn()
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useUnmarkVisited('c1', 'u1', onConflict), { wrapper })
    let res: { status: string } | undefined
    await act(async () => {
      res = await result.current.mutateAsync({ placeId: 'p1' })
    })
    expect(res).toEqual({ status: 'conflict' })
    expect(onConflict).toHaveBeenCalledTimes(1)
  })

  it('낙관적 토글: onMutate가 해당 place의 활성 방문행을 캐시에서 즉시 제거', async () => {
    h.state.selectResult = { data: [{ id: 'v1', version: 1 }], error: null }
    const { qc, wrapper } = makeWrapper()
    qc.setQueryData<VisitRow[]>(['visits', 'c1'], [aVisit({ id: 'v1', place_id: 'p1' })])
    const { result } = renderHook(() => useUnmarkVisited('c1', 'u1', vi.fn()), { wrapper })
    expect(qc.getQueryData<VisitRow[]>(['visits', 'c1'])).toHaveLength(1)
    await act(async () => {
      await result.current.mutateAsync({ placeId: 'p1' })
    })
    // onMutate에서 p1 행이 캐시에서 사라져야 마커가 즉시 '가고싶음'으로 토글된다.
    expect((qc.getQueryData<VisitRow[]>(['visits', 'c1']) ?? []).some((v) => v.place_id === 'p1')).toBe(false)
  })

  it('롤백: mutationFn이 throw하면 onError가 스냅샷을 복원한다(무음 덮어쓰기 금지)', async () => {
    h.state.selectResult = { data: null, error: { message: 'boom' } } // selErr → throw
    const { qc, wrapper } = makeWrapper()
    const snapshot = [aVisit({ id: 'v1', place_id: 'p1' })]
    qc.setQueryData<VisitRow[]>(['visits', 'c1'], snapshot)
    const { result } = renderHook(() => useUnmarkVisited('c1', 'u1', vi.fn()), { wrapper })
    await act(async () => {
      await expect(result.current.mutateAsync({ placeId: 'p1' })).rejects.toThrow('boom')
    })
    // 에러 후 캐시가 원래 스냅샷으로 복원돼야 한다.
    expect(qc.getQueryData<VisitRow[]>(['visits', 'c1'])).toEqual(snapshot)
  })

  it('오프라인: 살아있는 행을 큐잉(placeId+myId+coupleId) — 재연결 시 flush가 재조회', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true, writable: true })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useUnmarkVisited('c1', 'u1', vi.fn()), { wrapper })
    let res: { status: string } | undefined
    await act(async () => {
      res = await result.current.mutateAsync({ placeId: 'p1' })
    })
    // 오프라인 삭제는 어떤 행을 지웠는지 모르므로 Undo 복구 대상 없음(deleted: []).
    expect(res).toEqual({ status: 'removed', deleted: [] })
    expect(h.enqueue).toHaveBeenCalledWith(
      'visit.remove',
      { placeId: 'p1', myId: 'u1', coupleId: 'c1' },
      'visit.remove:p1',
    )
    expect(h.softDelete).not.toHaveBeenCalled() // 오프라인엔 즉시 softDelete하지 않는다
  })
})
