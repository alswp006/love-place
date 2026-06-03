import { useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'

type Status = 'idle' | 'sending' | 'sent' | 'error'

// 매직링크(OTP) 로그인 — 이메일을 받아 로그인 링크를 보낸다(§10.3, 비번 없음).
// 콜백은 /auth/callback 으로 돌아온다(Supabase Redirect URLs에 등록 필요).
export function useSignInWithOtp() {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  const sendMagicLink = useCallback(async (email: string) => {
    setError(null)
    if (!isSupabaseConfigured) {
      setStatus('error')
      setError('Supabase 키가 아직 설정되지 않았어요. .env에 URL·anon 키를 넣어주세요.')
      return
    }
    const trimmed = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setStatus('error')
      setError('올바른 이메일 주소를 입력해주세요.')
      return
    }

    setStatus('sending')
    const redirectTo = `${window.location.origin}/auth/callback`
    const { error: err } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: redirectTo },
    })
    if (err) {
      setStatus('error')
      setError(err.message)
      return
    }
    setStatus('sent')
  }, [])

  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
  }, [])

  return { status, error, sendMagicLink, reset }
}
