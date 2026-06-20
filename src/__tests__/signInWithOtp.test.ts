import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// supabase 클라이언트 모킹(vi.hoisted로 끌어올려 vi.mock 팩토리에서 참조).
const { signInWithOtp, verifyOtp } = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { signInWithOtp, verifyOtp } },
}))

import { useSignInWithOtp } from '@/hooks/useSignInWithOtp'

beforeEach(() => {
  signInWithOtp.mockReset()
  verifyOtp.mockReset()
  // window.location.origin 사용
})

describe('useSignInWithOtp - sendMagicLink', () => {
  it('레이트리밋 에러를 친화 카피로 매핑한다', async () => {
    signInWithOtp.mockResolvedValue({ error: { message: 'email rate limit exceeded' } })
    const { result } = renderHook(() => useSignInWithOtp())
    await act(async () => {
      await result.current.sendMagicLink('test@x.com')
    })
    expect(result.current.error).toBe('잠시 후 다시 시도해 주세요 (메일 재전송 한도)')
    expect(result.current.status).toBe('error')
  })

  it('HTTP 429 상태의 에러도 친화 카피로 매핑한다', async () => {
    signInWithOtp.mockResolvedValue({ error: { message: 'Too many requests', status: 429 } })
    const { result } = renderHook(() => useSignInWithOtp())
    await act(async () => {
      await result.current.sendMagicLink('test@x.com')
    })
    expect(result.current.error).toBe('잠시 후 다시 시도해 주세요 (메일 재전송 한도)')
  })

  it('일반 에러는 메시지를 그대로 표면화한다', async () => {
    signInWithOtp.mockResolvedValue({ error: { message: '알 수 없는 오류' } })
    const { result } = renderHook(() => useSignInWithOtp())
    await act(async () => {
      await result.current.sendMagicLink('test@x.com')
    })
    expect(result.current.error).toBe('알 수 없는 오류')
  })
})

describe('useSignInWithOtp - verifyCode', () => {
  it('6자리가 아니면 supabase를 호출하지 않고 검증 에러', async () => {
    const { result } = renderHook(() => useSignInWithOtp())
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.verifyCode('test@x.com', '123')
    })
    expect(ok).toBe(false)
    expect(result.current.error).toMatch(/6자리/)
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('6자리 코드면 verifyOtp를 type:email로 호출 + true', async () => {
    verifyOtp.mockResolvedValue({ error: null })
    const { result } = renderHook(() => useSignInWithOtp())
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.verifyCode('  test@x.com ', ' 123456 ')
    })
    expect(ok).toBe(true)
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'test@x.com',
      token: '123456',
      type: 'email',
    })
  })

  it('verifyOtp 에러는 메시지를 표면화하고 false', async () => {
    verifyOtp.mockResolvedValue({ error: { message: '코드가 만료되었습니다' } })
    const { result } = renderHook(() => useSignInWithOtp())
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.verifyCode('test@x.com', '123456')
    })
    expect(ok).toBe(false)
    expect(result.current.error).toBe('코드가 만료되었습니다')
    expect(result.current.status).toBe('error')
  })
})
