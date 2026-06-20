import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/state/auth'
import { supabase } from '@/lib/supabase/client'
import { RouteFallback } from '@/components/common/RouteFallback'
import { EmptyState } from '@/components/common/EmptyState'

// 매직링크 콜백 — Supabase가 detectSessionInUrl로 URL의 토큰을 세션으로 교환한다(§4.2).
// 세션이 생기면 앱으로, 실패하면 안내 + 다시 로그인.
export default function AuthCallbackPage() {
  const { initializing, session } = useAuth()
  const navigate = useNavigate()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    // 토큰 교환이 늦게 잡히는 경우를 대비해 마운트 시 한 번 명시적으로 세션을 끌어온다(R3.6).
    // onAuthStateChange를 통해 useAuth가 갱신되므로 여기선 호출만 하면 된다.
    void supabase.auth.getSession()
    // 토큰 교환이 지나치게 오래 걸리면(잘못된/만료된 링크, 교차 브라우저) 안내로 전환.
    const t = setTimeout(() => setTimedOut(true), 8000)
    return () => clearTimeout(t)
  }, [])

  // 세션이 잡히면 곧장 앱 첫 화면으로.
  if (!initializing && session) return <Navigate to="/" replace />

  if (timedOut && !session) {
    return (
      <EmptyState
        emoji="⏳"
        title="로그인 링크가 만료됐거나 잘못됐어요"
        hint="이 링크를 처음 요청한 브라우저에서 열어주세요. 또는 로그인 화면에서 6자리 코드로 로그인하세요."
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
