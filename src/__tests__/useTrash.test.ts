import { describe, it, expect, vi, beforeEach } from 'vitest'

// useTrash/useRestore(R3 T16) — 휴지통을 전 엔티티로 일반화(table 파라미터화).
// TRASH_KINDS: kind→{table, label, nameColumns}(색+라벨 배지 메타 §4). trashLabelOf: kind별 표시 필드 선택.
// useRestore(kind,…): restore(table,…) 래핑(낙관적 락 + 오프라인 큐). 0행=충돌 → onConflict.
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
import { TRASH_KINDS, trashLabelOf, useRestore, type TrashKind } from '@/hooks/useTrash'

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

describe('TRASH_KINDS (kind 배지 메타 — table·라벨·이름컬럼)', () => {
  it('6개 엔티티 전부 매핑(places/events/visits/photos/trips/itineraries)', () => {
    const kinds: TrashKind[] = ['places', 'events', 'visits', 'photos', 'trips', 'itineraries']
    for (const k of kinds) expect(TRASH_KINDS[k]).toBeTruthy()
  })

  it('각 kind는 {table, label, nameColumns}를 갖는다', () => {
    for (const k of Object.keys(TRASH_KINDS) as TrashKind[]) {
      const meta = TRASH_KINDS[k]
      expect(typeof meta.table).toBe('string')
      expect(typeof meta.label).toBe('string')
      expect(Array.isArray(meta.nameColumns)).toBe(true)
    }
  })

  it('table은 kind 이름과 일치(places→places 등)', () => {
    expect(TRASH_KINDS.places.table).toBe('places')
    expect(TRASH_KINDS.events.table).toBe('events')
    expect(TRASH_KINDS.visits.table).toBe('visits')
    expect(TRASH_KINDS.photos.table).toBe('photos')
    expect(TRASH_KINDS.trips.table).toBe('trips')
    expect(TRASH_KINDS.itineraries.table).toBe('itineraries')
  })

  it('한국어 라벨(장소/일정/방문/사진/여행/코스)', () => {
    expect(TRASH_KINDS.places.label).toBe('장소')
    expect(TRASH_KINDS.events.label).toBe('일정')
    expect(TRASH_KINDS.visits.label).toBe('방문')
    expect(TRASH_KINDS.photos.label).toBe('사진')
    expect(TRASH_KINDS.trips.label).toBe('여행')
    expect(TRASH_KINDS.itineraries.label).toBe('코스')
  })
})

describe('trashLabelOf (kind별 표시 필드 선택)', () => {
  it('events → title', () => {
    expect(trashLabelOf('events', { id: 'e', title: '데이트', deleted_at: 'x', version: 1 })).toBe('데이트')
  })
  it('trips → title', () => {
    expect(trashLabelOf('trips', { id: 't', title: '부산 여행', deleted_at: 'x', version: 1 })).toBe('부산 여행')
  })
  it('places → name', () => {
    expect(trashLabelOf('places', { id: 'p', name: '성수 카페', deleted_at: 'x', version: 1 })).toBe('성수 카페')
  })
  it("photos → caption, 없으면 '사진'", () => {
    expect(trashLabelOf('photos', { id: 'ph', caption: '노을', deleted_at: 'x', version: 1 })).toBe('노을')
    expect(trashLabelOf('photos', { id: 'ph', caption: null, deleted_at: 'x', version: 1 })).toBe('사진')
  })
  it('visits → place/date 문자열', () => {
    const row = { id: 'v', places: { name: '광안리' }, visit_date: '2026-05-01', deleted_at: 'x', version: 1 }
    expect(trashLabelOf('visits', row)).toContain('광안리')
    expect(trashLabelOf('visits', row)).toContain('2026-05-01')
  })
  it("itineraries → '코스' 폴백(별도 title 컬럼 없음)", () => {
    expect(trashLabelOf('itineraries', { id: 'i', deleted_at: 'x', version: 1 })).toBe('코스')
  })
})

describe('useRestore (일반화 복구 — 낙관적 락 + 오프라인 큐)', () => {
  it('온라인: restore(table, id, expectedVersion, myId) 호출 + 무효화 키 2개', async () => {
    const onConflict = vi.fn()
    const { invalidate, wrapper } = makeWrapper()
    const { result } = renderHook(() => useRestore('events', 'c1', 'u1', onConflict), { wrapper })
    await act(async () => {
      result.current.restore({ id: 'e1', expectedVersion: 3 })
    })
    expect(h.restore).toHaveBeenCalledWith('events', 'e1', 3, 'u1')
    expect(h.enqueue).not.toHaveBeenCalled()
    expect(onConflict).not.toHaveBeenCalled()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trash', 'events', 'c1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['events', 'c1'] })
  })

  it('충돌(conflict 반환) → onConflict 호출(무음 덮어쓰기 금지)', async () => {
    h.restore.mockResolvedValue({ status: 'conflict' })
    const onConflict = vi.fn()
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useRestore('places', 'c1', 'u1', onConflict), { wrapper })
    await act(async () => {
      result.current.restore({ id: 'p1', expectedVersion: 2 })
    })
    expect(onConflict).toHaveBeenCalledTimes(1)
  })

  it('오프라인: enqueue("{table}.restore", payload, dedupe) — restore 미호출', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true, writable: true })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useRestore('photos', 'c1', 'u1', vi.fn()), { wrapper })
    await act(async () => {
      result.current.restore({ id: 'ph1', expectedVersion: 5 })
    })
    expect(h.enqueue).toHaveBeenCalledWith(
      'photos.restore',
      { id: 'ph1', expectedVersion: 5, myId: 'u1' },
      'photos.restore:ph1',
    )
    expect(h.restore).not.toHaveBeenCalled()
  })

  it('로그인 안 됨(myId=null) → restore/enqueue 미호출', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useRestore('events', 'c1', null, vi.fn()), { wrapper })
    await act(async () => {
      result.current.restore({ id: 'e1', expectedVersion: 3 })
    })
    expect(h.restore).not.toHaveBeenCalled()
    expect(h.enqueue).not.toHaveBeenCalled()
  })
})
