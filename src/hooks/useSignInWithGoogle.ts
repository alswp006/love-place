import { useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { isNativePlatform } from '@/lib/platform'
import { Browser } from '@capacitor/browser'

// 구글 OAuth 로그인 — 메일 발송 없음(매직링크 한도 문제 회피). 클릭 → 구글 동의 → 자동 로그인.
// 콜백은 /auth/callback 으로 돌아온다(Supabase Redirect URLs에 등록 필요).
// 가입 시 handle_new_user 트리거가 profiles를 자동 생성하므로 매직링크와 동일하게 동작.
// 네이티브(Capacitor): Google은 임베디드 WebView OAuth를 차단(disallowed_useragent)하므로,
//   skipBrowserRedirect로 인증 URL만 받아 @capacitor/browser(시스템 브라우저/ASWebAuthenticationSession)로 연다.
//   복귀는 커스텀 스킴 app.loveplace://auth/callback → appUrlOpen → exchangeCodeForSession(authDeepLink).
//   (웹 콜백으로 보내면 시스템 브라우저 안에 웹앱이 열린 채 남는다. 스킴은 Info.plist + Supabase allowlist 등록.)
export function useSignInWithGoogle() {
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
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      })
      if (err) {
        setLoading(false)
        setError(err.message)
        return
      }
      if (data?.url) await Browser.open({ url: data.url }) // 시스템 브라우저(WebView 차단 회피)
      // 복귀는 딥링크(appUrlOpen)가 세션을 교환 — loading은 복귀/세션 갱신까지 유지.
      return
    }

    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    // 웹: 성공 시 구글 페이지로 리다이렉트되므로 이 아래는 보통 실행 안 됨.
    if (err) {
      setLoading(false)
      setError(err.message)
    }
  }, [])

  return { signIn, loading, error }
}
