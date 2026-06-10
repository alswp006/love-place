import { useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'

type Status = 'idle' | 'signing' | 'error'

// 이메일+비밀번호 로그인 — 테스트/개발용 보조 경로(자동 검증 안전망).
// 매직링크/OAuth가 정본이고, 이 경로는 LoginPage가 import.meta.env.DEV로 게이팅해 운영 빌드엔 노출하지 않는다.
// 계정은 Supabase 대시보드에서 Email provider 활성화 + 테스트 계정 생성(이메일 확인 완료)이 선행 — docs/rls-testing.md.
export function useSignInWithPassword() {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  // 성공 시 true. 세션 반영·리다이렉트는 auth.tsx의 onAuthStateChange가 담당.
  const signIn = useCallback(async (email: string, password: string): Promise<boolean> => {
    setError(null)
    if (!isSupabaseConfigured) {
      setStatus('error')
      setError('Supabase 키가 아직 설정되지 않았어요. .env에 URL·anon 키를 넣어주세요.')
      return false
    }
    const trimmed = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setStatus('error')
      setError('올바른 이메일 주소를 입력해주세요.')
      return false
    }
    if (password.length < 6) {
      setStatus('error')
      setError('비밀번호는 6자 이상이어야 해요.')
      return false
    }

    setStatus('signing')
    const { error: err } = await supabase.auth.signInWithPassword({ email: trimmed, password })
    if (err) {
      setStatus('error')
      setError(err.message)
      return false
    }
    setStatus('idle')
    return true
  }, [])

  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
  }, [])

  return { status, error, signIn, reset }
}
