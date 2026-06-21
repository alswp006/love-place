import { describe, it, expect, vi, beforeEach } from 'vitest'

// useCollections — 사용자 정의 저장 목록(가산 데이터 레이어). 내장 도출 가고싶음/가본과 별개.
// 변경(rename/delete/removePlace)은 낙관적 락(version 조건부) — 0행 = 충돌 → onConflict(LWW 금지 §4.3).
// addPlaceToCollection은 unique-violation(23505)을 멱등 no-op으로 삼킨다(더블탭/재시도 안전).
// supabase를 useVisits/useReactions 테스트와 동형으로 모킹(hoisted 체이너블 쿼리빌더).

const h = vi.hoisted(() => {
  // from(table) 호출 시 마지막 쿼리 빌더를 새로 만들고, 각 호출의 결과를 큐에서 꺼낸다.
  type Res = { data: unknown; error: { message: string; code?: string } | null }
  const state: { results: Res[]; fromCalls: string[]; insertArgs: unknown[] } = {
    results: [],
    fromCalls: [],
    insertArgs: [],
  }
  const versionedUpdate = vi.fn(async () => ({ status: 'ok', row: {} }) as { status: 'ok' | 'conflict'; row?: unknown })
  const softDelete = vi.fn(async () => ({ status: 'ok' }) as { status: 'ok' | 'conflict' })

  function makeBuilder() {
    const q: Record<string, unknown> = {}
    // 체인 메서드는 자기 자신을 반환. 종단(await)은 then으로 큐의 다음 결과를 돌려준다.
    const chain = ['select', 'insert', 'eq', 'is', 'order', 'limit']
    for (const m of chain) {
      q[m] = vi.fn((...args: unknown[]) => {
        if (m === 'insert') state.insertArgs.push(args[0])
        return q
      })
    }
    // single()/maybeSingle()도 다음 결과 반환(프로미스 형태).
    q.single = vi.fn(() => Promise.resolve(state.results.shift() ?? { data: null, error: null }))
    q.maybeSingle = vi.fn(() => Promise.resolve(state.results.shift() ?? { data: null, error: null }))
    // thenable — `await query` 종단에서 큐의 다음 결과를 돌려준다.
    q.then = (resolve: (v: Res) => unknown) => resolve(state.results.shift() ?? { data: [], error: null })
    return q
  }
  const from = vi.fn((table: string) => {
    state.fromCalls.push(table)
    return makeBuilder()
  })
  return { state, versionedUpdate, softDelete, from }
})

vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: h.from },
  isSupabaseConfigured: true,
}))
vi.mock('@/lib/sync/versionedUpdate', async (orig) => {
  const real = await orig<typeof import('@/lib/sync/versionedUpdate')>()
  return { ...real, versionedUpdate: h.versionedUpdate, softDelete: h.softDelete }
})

import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import {
  useCollections,
  usePlaceCollections,
  useCreateCollection,
  useRenameCollection,
  useDeleteCollection,
  useAddPlaceToCollection,
  useRemovePlaceFromCollection,
} from '@/hooks/useCollections'

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
  return { qc, wrapper }
}

beforeEach(() => {
  h.state.results = []
  h.state.fromCalls = []
  h.state.insertArgs = []
  h.versionedUpdate.mockReset()
  h.versionedUpdate.mockResolvedValue({ status: 'ok', row: {} })
  h.softDelete.mockReset()
  h.softDelete.mockResolvedValue({ status: 'ok' })
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true })
})

describe('useCollections (조회)', () => {
  it('살아있는 컬렉션을 키 [collections, coupleId]로 가져온다', async () => {
    h.state.results = [{ data: [{ id: 'col1', name: '데이트', version: 1 }], error: null }]
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useCollections('c1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([{ id: 'col1', name: '데이트', version: 1 }])
    expect(h.state.fromCalls).toContain('collections')
  })

  it('coupleId 없으면 쿼리 비활성(빈 배열·네트워크 없음)', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useCollections(null), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('usePlaceCollections (조회)', () => {
  it('커플의 살아있는 조인행을 키 [place_collections, coupleId]로 가져온다', async () => {
    h.state.results = [
      { data: [{ id: 'pc1', collection_id: 'col1', place_id: 'p1', version: 1 }], error: null },
    ]
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => usePlaceCollections('c1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([{ id: 'pc1', collection_id: 'col1', place_id: 'p1', version: 1 }])
    expect(h.state.fromCalls).toContain('place_collections')
  })
})

describe('useCreateCollection', () => {
  it('이름으로 컬렉션을 insert한다(couple_id·감사필드 채움)', async () => {
    h.state.results = [{ data: { id: 'new1' }, error: null }]
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateCollection('c1', 'u1'), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ name: '맛집' })
    })
    expect(h.state.fromCalls).toContain('collections')
    expect(h.state.insertArgs[0]).toMatchObject({
      couple_id: 'c1',
      name: '맛집',
      created_by: 'u1',
      updated_by: 'u1',
    })
  })

  it('미연결(coupleId/myId null)이면 에러', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateCollection(null, null), { wrapper })
    await act(async () => {
      await expect(result.current.mutateAsync({ name: 'x' })).rejects.toThrow()
    })
  })
})

describe('useRenameCollection (낙관적 락)', () => {
  it('version 조건부 update 성공', async () => {
    const onConflict = vi.fn()
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useRenameCollection('c1', 'u1', onConflict), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: 'col1', version: 2, name: '새이름' })
    })
    expect(h.versionedUpdate).toHaveBeenCalledWith('collections', 'col1', 2, {
      name: '새이름',
      updated_by: 'u1',
    })
    expect(onConflict).not.toHaveBeenCalled()
  })

  it('0행(conflict) → onConflict 호출(무음 덮어쓰기 금지)', async () => {
    h.versionedUpdate.mockResolvedValue({ status: 'conflict' })
    const onConflict = vi.fn()
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useRenameCollection('c1', 'u1', onConflict), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: 'col1', version: 2, name: '새이름' })
    })
    expect(onConflict).toHaveBeenCalledTimes(1)
  })
})

describe('useDeleteCollection (soft-delete, 낙관적 락)', () => {
  it('softDelete 호출(version 조건부)', async () => {
    const onConflict = vi.fn()
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDeleteCollection('c1', 'u1', onConflict), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: 'col1', version: 3 })
    })
    expect(h.softDelete).toHaveBeenCalledWith('collections', 'col1', 3, 'u1')
    expect(onConflict).not.toHaveBeenCalled()
  })

  it('0행(conflict) → onConflict 호출', async () => {
    h.softDelete.mockResolvedValue({ status: 'conflict' })
    const onConflict = vi.fn()
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDeleteCollection('c1', 'u1', onConflict), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: 'col1', version: 3 })
    })
    expect(onConflict).toHaveBeenCalledTimes(1)
  })
})

describe('useAddPlaceToCollection', () => {
  it('조인행 insert(couple_id·감사필드 채움)', async () => {
    h.state.results = [{ data: null, error: null }]
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useAddPlaceToCollection('c1', 'u1'), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ placeId: 'p1', collectionId: 'col1' })
    })
    expect(h.state.fromCalls).toContain('place_collections')
    expect(h.state.insertArgs[0]).toMatchObject({
      couple_id: 'c1',
      collection_id: 'col1',
      place_id: 'p1',
      created_by: 'u1',
      updated_by: 'u1',
    })
  })

  it('unique-violation(23505)은 멱등 no-op(throw 안 함)', async () => {
    h.state.results = [{ data: null, error: { message: 'duplicate key', code: '23505' } }]
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useAddPlaceToCollection('c1', 'u1'), { wrapper })
    await act(async () => {
      // 멱등 no-op이므로 reject되지 않아야 한다.
      await expect(result.current.mutateAsync({ placeId: 'p1', collectionId: 'col1' })).resolves.toBeUndefined()
    })
  })

  it('다른 에러는 throw', async () => {
    h.state.results = [{ data: null, error: { message: 'boom', code: '42501' } }]
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useAddPlaceToCollection('c1', 'u1'), { wrapper })
    await act(async () => {
      await expect(result.current.mutateAsync({ placeId: 'p1', collectionId: 'col1' })).rejects.toThrow('boom')
    })
  })
})

describe('useRemovePlaceFromCollection (soft-delete 살아있는 조인행)', () => {
  it('살아있는 조인행을 재조회 → softDelete', async () => {
    // 첫 결과 = 살아있는 조인행 조회(id+version), softDelete는 h.softDelete가 처리.
    h.state.results = [{ data: [{ id: 'pc1', version: 1 }], error: null }]
    const onConflict = vi.fn()
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useRemovePlaceFromCollection('c1', 'u1', onConflict), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ placeId: 'p1', collectionId: 'col1' })
    })
    expect(h.softDelete).toHaveBeenCalledWith('place_collections', 'pc1', 1, 'u1')
    expect(onConflict).not.toHaveBeenCalled()
  })

  it('살아있는 조인행이 없으면 no-op(softDelete 미호출)', async () => {
    h.state.results = [{ data: [], error: null }]
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useRemovePlaceFromCollection('c1', 'u1', vi.fn()), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ placeId: 'p1', collectionId: 'col1' })
    })
    expect(h.softDelete).not.toHaveBeenCalled()
  })

  it('softDelete 0행(conflict) → onConflict', async () => {
    h.state.results = [{ data: [{ id: 'pc1', version: 1 }], error: null }]
    h.softDelete.mockResolvedValue({ status: 'conflict' })
    const onConflict = vi.fn()
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useRemovePlaceFromCollection('c1', 'u1', onConflict), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ placeId: 'p1', collectionId: 'col1' })
    })
    expect(onConflict).toHaveBeenCalledTimes(1)
  })
})
