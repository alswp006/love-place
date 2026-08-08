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
// browserFinished 리스너가 추가됐다 — 사용자가 시트를 그냥 닫았을 때 로딩을 되돌리기 위해서다.
// (그 동작 자체는 oauthBrowser.test.ts가 검증한다. 여기선 '시스템 브라우저로 연다'만 본다.)
vi.mock('@capacitor/browser', () => ({
  Browser: { open: browserOpen, addListener: vi.fn(async () => ({ remove: async () => {} })) },
}))

import { useSignInWithApple } from '@/hooks/useSignInWithApple'

describe('useSignInWithApple — App Store 4.8 대응', () => {
  beforeEach(() => {
    signInWithOAuth.mockReset()
    browserOpen.mockClear()
  })

  it('웹: provider=apple 일반 리다이렉트(skipBrowserRedirect 없음)', async () => {
    platform.native = false
    signInWithOAuth.mockResolvedValue({ data: {}, error: null })
    const { result } = renderHook(() => useSignInWithApple())
    await act(async () => {
      await result.current.signIn()
    })
    expect(signInWithOAuth.mock.calls[0]![0].provider).toBe('apple')
    expect(signInWithOAuth.mock.calls[0]![0].options.skipBrowserRedirect).toBeUndefined()
    expect(browserOpen).not.toHaveBeenCalled()
  })

  it('네이티브: skipBrowserRedirect + 시스템 브라우저로 연다(WebView OAuth 회피)', async () => {
    platform.native = true
    signInWithOAuth.mockResolvedValue({ data: { url: 'https://appleid.apple.com/auth?x=1' }, error: null })
    const { result } = renderHook(() => useSignInWithApple())
    await act(async () => {
      await result.current.signIn()
    })
    expect(signInWithOAuth.mock.calls[0]![0].options.skipBrowserRedirect).toBe(true)
    expect(signInWithOAuth.mock.calls[0]![0].options.redirectTo).toBe('app.loveplace://auth/callback')
    expect(browserOpen).toHaveBeenCalledWith({ url: 'https://appleid.apple.com/auth?x=1' })
  })

  it('에러는 표면화하고 로딩 해제', async () => {
    platform.native = false
    signInWithOAuth.mockResolvedValue({ data: {}, error: { message: 'Apple 실패' } })
    const { result } = renderHook(() => useSignInWithApple())
    await act(async () => {
      await result.current.signIn()
    })
    expect(result.current.error).toBe('Apple 실패')
    expect(result.current.loading).toBe(false)
  })
})
