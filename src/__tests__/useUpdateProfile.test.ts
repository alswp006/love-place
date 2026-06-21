import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// supabase update 체이닝 모킹(낙관적 락 update → eq → eq → select). 성공 1행 반환.
const { updateFn } = vi.hoisted(() => ({ updateFn: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { from: () => ({ update: updateFn }) },
}))
vi.mock('@/state/auth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, session: null, configured: true, initializing: false }),
}))

import { useUpdateProfile } from '@/hooks/useUpdateProfile'

beforeEach(() => {
  updateFn.mockReset()
  // .update(patch).eq().eq().select() → { data: [{id}], error: null }
  const chain = {
    eq: vi.fn(() => chain),
    select: vi.fn(() => Promise.resolve({ data: [{ id: 'u1' }], error: null })),
  }
  updateFn.mockReturnValue(chain)
})

describe('useUpdateProfile — onSettled 무효화', () => {
  it('성공 후 myProfile/couple/profiles 쿼리를 모두 무효화한다', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children)

    const { result } = renderHook(() => useUpdateProfile('c1'), { wrapper })
    await act(async () => {
      await result.current.updateProfile({ display_name: '하늘', color: '#c25d86', expectedVersion: 4 })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['myProfile', 'u1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['couple', 'u1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['profiles', 'c1'] })
  })
})
