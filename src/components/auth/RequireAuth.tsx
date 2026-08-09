import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/state/auth'
import { useCouple } from '@/hooks/useCouple'
import { useEnsureCouple } from '@/hooks/useEnsureCouple'
import { RouteFallback } from '@/components/common/RouteFallback'
import { ToastProvider } from '@/components/common/ToastProvider'

// 보호 라우트 가드(web-stack.md §4.2) — 비로그인 → /auth.
//
// 연결은 더 이상 관문이 아니다(0024). 한 사람이 먼저 쓰기 시작하는 경우가 흔한데, 예전에는
// 로그인하자마자 연결 화면에 갇혀 아무것도 못 봤다. 이제 로그인하면 '혼자짜리 커플'이 보장되고
// 곧바로 앱으로 들어간다. 연결은 우리 탭에서 원할 때 한다.
//
// /onboarding(연결)은 이제 **자발적으로 찾아가는 화면**이다. 이미 상대가 있으면 앱으로 돌린다.
export function RequireAuth() {
  const { initializing, session } = useAuth()
  const { data: couple, isLoading: coupleLoading } = useCouple()
  const location = useLocation()
  const active = couple?.status === 'ACTIVE'
  const hasPartner = Boolean(couple?.partner)

  // ACTIVE가 없으면 솔로 커플을 깔아 준다(트리거·백필이 빗나간 계정의 마지막 방어선).
  const ensure = useEnsureCouple({ needed: Boolean(session) && !coupleLoading && !active })

  if (initializing) return <RouteFallback />
  if (!session) return <Navigate to="/auth" replace state={{ from: location.pathname }} />

  // 세션은 있으나 커플 상태 로딩 중 → 깜빡임 방지.
  if (coupleLoading) return <RouteFallback />

  const onboarding = location.pathname === '/onboarding'

  // 토스트는 보호 셸 전역(온보딩 포함)에서 제공 — ConnectPage 등 AppLayout 밖 화면도 useToast 사용.
  const guarded = (node: React.ReactElement) => <ToastProvider>{node}</ToastProvider>

  if (!active) {
    // 솔로 커플을 만드는 중 — 잠깐 기다린다.
    if (ensure.state === 'idle' || ensure.state === 'running') return <RouteFallback />
    // 끝내 못 만들었다면(권한·네트워크) 연결 화면이 유일하게 의미 있는 화면이다.
    return onboarding ? guarded(<Outlet />) : <Navigate to="/onboarding" replace />
  }

  // 이미 상대가 있는데 연결 화면에 있으면 → 앱으로. (혼자면 연결하러 온 것이니 통과시킨다.)
  if (onboarding && hasPartner) return <Navigate to="/" replace />

  return guarded(<Outlet />)
}
