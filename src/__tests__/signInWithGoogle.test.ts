import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const platform = vi.hoisted(() => ({ native: false }))
const signInWithOAuth = vi.hoisted(() => vi.fn())
const browserOpen = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/lib/platform', () => ({ isNativePlatform: () => platform.native }))
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { signInWithOAuth } },
}))
vi.mock('@capacitor/browser', () => ({ Browser: { open: browserOpen } }))

import { useSignInWithGoogle } from '@/hooks/useSignInWithGoogle'

describe('useSignInWithGoogle — 네이티브/웹 분기', () => {
  beforeEach(() => {
    signInWithOAuth.mockReset()
    browserOpen.mockClear()
  })

  it('웹: 일반 리다이렉트(skipBrowserRedirect 없음), Browser 미사용', async () => {
    platform.native = false
    signInWithOAuth.mockResolvedValue({ data: {}, error: null })
    const { result } = renderHook(() => useSignInWithGoogle())
    await act(async () => {
      await result.current.signIn()
    })
    const opts = signInWithOAuth.mock.calls[0]![0].options
    expect(opts.skipBrowserRedirect).toBeUndefined()
    expect(opts.redirectTo).toMatch(/\/auth\/callback$/)
    expect(opts.redirectTo).not.toMatch(/^app\.loveplace:/)
    expect(browserOpen).not.toHaveBeenCalled()
  })

  it('네이티브: skipBrowserRedirect로 URL만 받아 시스템 브라우저로 연다(Google WebView 차단 회피)', async () => {
    platform.native = true
    signInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/o/oauth2/auth?x=1' }, error: null })
    const { result } = renderHook(() => useSignInWithGoogle())
    await act(async () => {
      await result.current.signIn()
    })
    expect(signInWithOAuth.mock.calls[0]![0].options.skipBrowserRedirect).toBe(true)
    // 복귀는 커스텀 스킴 딥링크 — 웹 콜백으로 보내면 시스템 브라우저에 웹앱이 열린 채 남는다.
    expect(signInWithOAuth.mock.calls[0]![0].options.redirectTo).toBe('app.loveplace://auth/callback')
    expect(browserOpen).toHaveBeenCalledWith({ url: 'https://accounts.google.com/o/oauth2/auth?x=1' })
  })

  it('에러는 표면화하고 로딩 해제', async () => {
    platform.native = false
    signInWithOAuth.mockResolvedValue({ data: {}, error: { message: '실패' } })
    const { result } = renderHook(() => useSignInWithGoogle())
    await act(async () => {
      await result.current.signIn()
    })
    expect(result.current.error).toBe('실패')
    expect(result.current.loading).toBe(false)
  })
})
