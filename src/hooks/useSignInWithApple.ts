import { useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { isNativePlatform } from '@/lib/platform'
import { openOAuthBrowser } from '@/lib/native/oauthBrowser'

// Apple 로그인 — App Store 4.8 대응(제3자 소셜 로그인 제공 시 'Apple로 로그인' 동등 옵션 요구).
// 콜백은 /auth/callback. Supabase Auth의 apple provider 설정(Service ID·키) 필요(서버 구성).
// 네이티브(Capacitor): 임베디드 WebView OAuth 제약 회피 위해 skipBrowserRedirect로 URL만 받아 시스템 브라우저로.
//   복귀는 커스텀 스킴 app.loveplace://auth/callback → appUrlOpen → exchangeCodeForSession(authDeepLink).
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
    const redirectTo = isNativePlatform() ? 'app.loveplace://auth/callback' : `${base}/auth/callback`

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
      // 사용자가 브라우저를 그냥 닫으면 아무 신호도 오지 않는다 — 그때만 버튼을 되돌린다.
      if (data?.url) await openOAuthBrowser(data.url, () => setLoading(false))
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
