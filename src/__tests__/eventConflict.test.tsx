import { describe, it, expect, vi, beforeEach } from 'vitest'

// Task 7(R2): 0행 충돌을 "버전충돌(ConflictError)" vs "권한거부(PermissionError)"로 분리.
// versionedUpdate가 conflict를 반환하면 refetchEventRow로 현재 서버 행을 재조회해 판별한다.
//  - 재조회 행이 상대 PERSONAL(visibility==='PERSONAL' && owner_id!==myId) → PermissionError → onPermissionDenied
//  - 그 외(SHARED 또는 내 PERSONAL) → ConflictError → onConflict
// ConflictError는 이미 존재(versionedUpdate.ts:7) — 재정의 금지·재사용. PermissionError만 신규.
const h = vi.hoisted(() => {
  const versionedUpdate = vi.fn()
  const refetchEventRow = vi.fn()
  return { versionedUpdate, refetchEventRow }
})

vi.mock('@/lib/sync/versionedUpdate', async (orig) => {
  const real = await orig<typeof import('@/lib/sync/versionedUpdate')>()
  return { ...real, versionedUpdate: h.versionedUpdate, refetchEventRow: h.refetchEventRow }
})

import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useEventMutations } from '@/hooks/useEventMutations'

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

const patch = { title: '바뀐 제목' }

beforeEach(() => {
  h.versionedUpdate.mockReset()
  h.refetchEventRow.mockReset()
  // update mutation은 항상 0행(conflict)을 반환하도록 고정 — 판별은 refetchEventRow로.
  h.versionedUpdate.mockResolvedValue({ status: 'conflict' })
})

describe('충돌 vs 권한거부 분기(Task 7)', () => {
  it('버전충돌(SHARED): refetch가 SHARED 반환 → onConflict 발화, onPermissionDenied 미호출', async () => {
    h.refetchEventRow.mockResolvedValue({ version: 5, memo: '서버메모', visibility: 'SHARED', owner_id: 'me' })
    const onConflict = vi.fn()
    const onPermissionDenied = vi.fn()
    const { result } = renderHook(
      () => useEventMutations('c1', 'me', onConflict, onPermissionDenied),
      { wrapper: wrap() },
    )
    await act(async () => {
      result.current.update.mutate({ id: 'e1', expectedVersion: 3, patch })
    })
    await vi.waitFor(() => expect(onConflict).toHaveBeenCalledTimes(1))
    expect(onPermissionDenied).not.toHaveBeenCalled()
  })

  it('버전충돌(내 PERSONAL): refetch가 내 PERSONAL 반환 → onConflict 발화', async () => {
    h.refetchEventRow.mockResolvedValue({ version: 5, memo: null, visibility: 'PERSONAL', owner_id: 'me' })
    const onConflict = vi.fn()
    const onPermissionDenied = vi.fn()
    const { result } = renderHook(
      () => useEventMutations('c1', 'me', onConflict, onPermissionDenied),
      { wrapper: wrap() },
    )
    await act(async () => {
      result.current.update.mutate({ id: 'e1', expectedVersion: 3, patch })
    })
    await vi.waitFor(() => expect(onConflict).toHaveBeenCalledTimes(1))
    expect(onPermissionDenied).not.toHaveBeenCalled()
  })

  it('권한거부(상대 PERSONAL): refetch가 상대 PERSONAL 반환 → onPermissionDenied 발화, onConflict 미호출', async () => {
    h.refetchEventRow.mockResolvedValue({ version: 5, memo: null, visibility: 'PERSONAL', owner_id: 'partner' })
    const onConflict = vi.fn()
    const onPermissionDenied = vi.fn()
    const { result } = renderHook(
      () => useEventMutations('c1', 'me', onConflict, onPermissionDenied),
      { wrapper: wrap() },
    )
    await act(async () => {
      result.current.update.mutate({ id: 'e1', expectedVersion: 3, patch })
    })
    await vi.waitFor(() => expect(onPermissionDenied).toHaveBeenCalledTimes(1))
    expect(onConflict).not.toHaveBeenCalled()
  })

  it('onPermissionDenied는 optional — 3-인자 호출(상대 PERSONAL)이어도 throw 없이 동작', async () => {
    h.refetchEventRow.mockResolvedValue({ version: 5, memo: null, visibility: 'PERSONAL', owner_id: 'partner' })
    const onConflict = vi.fn()
    const { result } = renderHook(() => useEventMutations('c1', 'me', onConflict), { wrapper: wrap() })
    await act(async () => {
      result.current.update.mutate({ id: 'e1', expectedVersion: 3, patch })
    })
    // 권한거부지만 핸들러 미배선 → onConflict도 안 불리고, 예외도 안 난다.
    await vi.waitFor(() => expect(h.refetchEventRow).toHaveBeenCalled())
    expect(onConflict).not.toHaveBeenCalled()
  })
})
