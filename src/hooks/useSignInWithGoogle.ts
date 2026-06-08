import { useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'

// 구글 OAuth 로그인 — 메일 발송 없음(매직링크 한도 문제 회피). 클릭 → 구글 동의 → 자동 로그인.
// 콜백은 /auth/callback 으로 돌아온다(Supabase Redirect URLs에 등록 필요).
// 가입 시 handle_new_user 트리거가 profiles를 자동 생성하므로 매직링크와 동일하게 동작.
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
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    // 성공 시 구글 페이지로 리다이렉트되므로 이 아래는 보통 실행 안 됨.
    if (err) {
      setLoading(false)
      setError(err.message)
    }
  }, [])

  return { signIn, loading, error }
}
