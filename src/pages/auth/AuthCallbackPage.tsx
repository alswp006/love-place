import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/state/auth'
import { supabase } from '@/lib/supabase/client'
import { RouteFallback } from '@/components/common/RouteFallback'
import { EmptyState } from '@/components/common/EmptyState'

// OAuth/매직링크 콜백 — Supabase가 detectSessionInUrl로 URL의 토큰을 세션으로 교환한다(§4.2).
// 추가: 구글 캘린더 '연동' 흐름이면(세션에 막 생긴 provider_refresh_token) gcal-proxy(connect)로
// 서버에 저장한 뒤 일정 탭으로 보낸다. refresh token 은 여기서 한 번만 잡힌다(이후 세션엔 없음).
export default function AuthCallbackPage() {
  const { initializing, session } = useAuth()
  const navigate = useNavigate()
  const [timedOut, setTimedOut] = useState(false)
  const [gcalPending] = useState(() => sessionStorage.getItem('gcal_connect_pending') === '1')
  const [gcalError, setGcalError] = useState<string | null>(null)
  const ranRef = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 8000)
    return () => clearTimeout(t)
  }, [])

  // 구글 캘린더 연동 캡처(연동 흐름일 때만).
  useEffect(() => {
    if (!gcalPending || initializing || !session || ranRef.current) return
    ranRef.current = true
    sessionStorage.removeItem('gcal_connect_pending')
    const refreshToken = session.provider_refresh_token
    if (!refreshToken) {
      setGcalError('구글에서 캘린더 오프라인 권한을 받지 못했어요. 다시 연동해 주세요.')
      return
    }
    void supabase.functions
      .invoke('gcal-proxy', {
        body: { action: 'connect', refreshToken, providerEmail: session.user.email ?? null },
      })
      .then(({ error }) => {
        if (error) setGcalError('구글 캘린더 연결에 실패했어요. 다시 시도해 주세요.')
        else navigate('/calendar', { replace: true })
      })
  }, [gcalPending, initializing, session, navigate])

  if (gcalError) {
    return (
      <EmptyState
        emoji="⚠️"
        title="구글 캘린더 연동에 실패했어요"
        hint={gcalError}
        action={
          <button type="button" onClick={() => navigate('/calendar', { replace: true })}>
            일정으로 가기
          </button>
        }
      />
    )
  }

  // 일반 로그인: 세션이 잡히면 앱으로. (연동 흐름이면 위 effect가 처리하므로 여기서 리다이렉트 안 함)
  if (!gcalPending && !initializing && session) return <Navigate to="/" replace />

  if (timedOut && !session) {
    return (
      <EmptyState
        emoji="⏳"
        title="로그인 링크가 만료됐거나 잘못됐어요"
        hint="로그인 화면에서 새 링크를 받아주세요."
        action={
          <button type="button" onClick={() => navigate('/auth', { replace: true })}>
            로그인으로 돌아가기
          </button>
        }
      />
    )
  }

  return <RouteFallback />
}
