import { useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { isNativePlatform } from '@/lib/platform'
import { Browser } from '@capacitor/browser'

// Apple 로그인 — App Store 4.8 대응(제3자 소셜 로그인 제공 시 'Apple로 로그인' 동등 옵션 요구).
// 콜백은 /auth/callback. Supabase Auth의 apple provider 설정(Service ID·키) 필요(서버 구성).
// 네이티브(Capacitor): 임베디드 WebView OAuth 제약 회피 위해 skipBrowserRedirect로 URL만 받아 시스템 브라우저로.
//   복귀는 appUrlOpen → exchangeCodeForSession(authDeepLink, P-A). redirect base는 배포 사이트 URL 우선.
export function useSignInWithApple() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signIn = useCallback(async () => {
    setError(null)
    if (!isSupabaseConfigured) {
      setError('서버 연결 전이에요. (개발 중)')
      return
    }
    setLoading(true)
    const base = import.meta.env.VITE_PUBLIC_SITE_URL?.trim() || window.location.origin
    const redirectTo = `${base}/auth/callback`

    if (isNativePlatform()) {
      const { data, error: err } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: { redirectTo, skipBrowserRedirect: true },
      })
      if (err) {
        setLoading(false)
        setError(err.message)
        return
      }
      if (data?.url) await Browser.open({ url: data.url })
      return
    }

    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo },
    })
    if (err) {
      setLoading(false)
      setError(err.message)
    }
  }, [])

  return { signIn, loading, error }
}
