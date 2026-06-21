import { useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'

type Status = 'idle' | 'sending' | 'sent' | 'error'

// 메일 재전송 한도(레이트리밋) 에러를 친화 카피로 매핑한다(R3.6).
// Supabase는 메시지에 "rate limit"을 담거나 HTTP 429 상태를 준다.
function isRateLimited(err: { message?: string; status?: number } | null): boolean {
  if (!err) return false
  if (err.status === 429) return true
  return /rate.?limit/i.test(err.message ?? '')
}

// 매직링크(OTP) 로그인 — 이메일을 받아 로그인 링크를 보낸다(§10.3, 비번 없음).
// 콜백은 /auth/callback 으로 돌아온다(Supabase Redirect URLs에 등록 필요).
// 메일이 안 오면 6자리 코드(verifyOtp) 폴백으로 직접 로그인할 수 있다(R3.6).
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
    // 네이티브 WebView의 로컬 origin(capacitor://·https://localhost)이 매직링크 redirect로 새지 않도록,
    // 배포된 사이트 URL이 있으면 그걸 베이스로 한다(없으면 기존처럼 현재 origin).
    const base = import.meta.env.VITE_PUBLIC_SITE_URL?.trim() || window.location.origin
    const redirectTo = `${base}/auth/callback`
    const { error: err } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: redirectTo },
    })
    if (err) {
      setStatus('error')
      setError(isRateLimited(err) ? '잠시 후 다시 시도해 주세요 (메일 재전송 한도)' : err.message)
      return
    }
    setStatus('sent')
  }, [])

  // 6자리 OTP 폴백 — 메일 링크 대신 코드를 직접 입력해 로그인(R3.6).
  const verifyCode = useCallback(async (email: string, token: string) => {
    setError(null)
    if (!/^\d{6}$/.test(token.trim())) {
      setError('6자리 코드를 입력해주세요.')
      return false
    }
    setStatus('sending')
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'email',
    })
    if (err) {
      setStatus('error')
      setError(err.message)
      return false
    }
    setStatus('sent')
    return true
  }, [])

  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
  }, [])

  return { status, error, sendMagicLink, verifyCode, reset }
}
