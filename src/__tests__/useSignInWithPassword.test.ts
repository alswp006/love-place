import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// supabase 클라이언트 모킹(vi.hoisted로 끌어올려 vi.mock 팩토리에서 참조).
const { signInWithPassword } = vi.hoisted(() => ({ signInWithPassword: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { signInWithPassword } },
}))

import { useSignInWithPassword } from '@/hooks/useSignInWithPassword'

describe('useSignInWithPassword', () => {
  beforeEach(() => signInWithPassword.mockReset())

  it('이메일 형식이 틀리면 호출하지 않고 에러', async () => {
    const { result } = renderHook(() => useSignInWithPassword())
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.signIn('not-an-email', 'secret123')
    })
    expect(ok).toBe(false)
    expect(result.current.error).toMatch(/이메일/)
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('비밀번호가 6자 미만이면 호출하지 않고 에러', async () => {
    const { result } = renderHook(() => useSignInWithPassword())
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.signIn('a@b.com', '123')
    })
    expect(ok).toBe(false)
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('정상 입력이면 trim된 이메일로 signInWithPassword 호출 + true', async () => {
    signInWithPassword.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useSignInWithPassword())
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.signIn('  test@x.com ', 'secret123')
    })
    expect(ok).toBe(true)
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'test@x.com', password: 'secret123' })
  })

  it('Supabase 오류 메시지를 그대로 표면화', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: '잘못된 로그인 자격 증명' } })
    const { result } = renderHook(() => useSignInWithPassword())
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.signIn('test@x.com', 'secret123')
    })
    expect(ok).toBe(false)
    expect(result.current.error).toBe('잘못된 로그인 자격 증명')
  })
})
