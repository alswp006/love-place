import { describe, it, expect, vi, beforeEach } from 'vitest'

// 댓글 훅 계약: 본문 검증(서버 CHECK와 같은 규칙) + 삭제는 version 조건부 soft-delete(LWW 금지 §4.3).
const insert = vi.fn()
const softDelete = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => ({
      insert: (...a: unknown[]) => {
        insert(...a)
        return { error: null }
      },
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}))
vi.mock('@/lib/sync/versionedUpdate', () => ({ softDelete: (...a: unknown[]) => softDelete(...a) }))

import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useAddComment, useDeleteComment, COMMENT_MAX_LEN } from '@/hooks/useComments'

function wrap() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  insert.mockReset()
  softDelete.mockReset().mockResolvedValue({ status: 'ok', row: {} })
})

describe('useAddComment', () => {
  it('본문을 trim해서 저장하고 author_id·created_by를 본인으로 박는다(위조 차단은 RLS가, 앱은 일관성)', async () => {
    const { result } = renderHook(() => useAddComment('c1', 'me', 'e1'), { wrapper: wrap() })
    await act(async () => {
      await result.current.mutateAsync({ body: '  주차 어려울 듯  ' })
    })
    expect(insert).toHaveBeenCalledOnce()
    expect(insert.mock.calls[0]![0]).toMatchObject({
      couple_id: 'c1',
      event_id: 'e1',
      body: '주차 어려울 듯',
      author_id: 'me',
      created_by: 'me',
      updated_by: 'me',
    })
  })

  it('공백만이면 거부한다(서버 CHECK 왕복 절약)', async () => {
    const { result } = renderHook(() => useAddComment('c1', 'me', 'e1'), { wrapper: wrap() })
    await expect(result.current.mutateAsync({ body: '   ' })).rejects.toThrow(/내용을 입력/)
    expect(insert).not.toHaveBeenCalled()
  })

  it('상한을 넘으면 거부한다', async () => {
    const { result } = renderHook(() => useAddComment('c1', 'me', 'e1'), { wrapper: wrap() })
    await expect(
      result.current.mutateAsync({ body: 'ㅇ'.repeat(COMMENT_MAX_LEN + 1) }),
    ).rejects.toThrow(new RegExp(`${COMMENT_MAX_LEN}자`))
    expect(insert).not.toHaveBeenCalled()
  })

  it('미연결(coupleId 없음)이면 안내 문구로 거부한다', async () => {
    const { result } = renderHook(() => useAddComment(null, 'me', 'e1'), { wrapper: wrap() })
    await expect(result.current.mutateAsync({ body: '아무거나' })).rejects.toThrow(/연결/)
  })
})

describe('useDeleteComment', () => {
  it('version 조건부 soft-delete로 보낸다(물리 삭제 아님 §4.3)', async () => {
    const onConflict = vi.fn()
    const { result } = renderHook(() => useDeleteComment('c1', 'me', 'e1', onConflict), {
      wrapper: wrap(),
    })
    await act(async () => {
      await result.current.mutateAsync({ id: 'cm1', expectedVersion: 7 })
    })
    expect(softDelete).toHaveBeenCalledWith('comments', 'cm1', 7, 'me')
    expect(onConflict).not.toHaveBeenCalled()
  })

  it('0행(서버 version이 더 높음)이면 조용히 덮어쓰지 않고 충돌을 알린다', async () => {
    softDelete.mockResolvedValue({ status: 'conflict' })
    const onConflict = vi.fn()
    const { result } = renderHook(() => useDeleteComment('c1', 'me', 'e1', onConflict), {
      wrapper: wrap(),
    })
    await act(async () => {
      await result.current.mutateAsync({ id: 'cm1', expectedVersion: 1 })
    })
    expect(onConflict).toHaveBeenCalledOnce()
  })
})
