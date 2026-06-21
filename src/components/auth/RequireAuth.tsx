import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/state/auth'
import { useCouple } from '@/hooks/useCouple'
import { RouteFallback } from '@/components/common/RouteFallback'
import { ToastProvider } from '@/components/common/ToastProvider'

// 보호 라우트 가드(web-stack.md §4.2) — 비로그인 → /auth, 미연결 → /onboarding(연결).
// 연결=공유 기본값(§1)이므로 사전 동의 게이트는 없다. ACTIVE 커플은 앱으로 직행.
export function RequireAuth() {
  const { initializing, session } = useAuth()
  const { data: couple, isLoading: coupleLoading } = useCouple()
  const location = useLocation()
  const active = couple?.status === 'ACTIVE'

  if (initializing) return <RouteFallback />
  if (!session) return <Navigate to="/auth" replace state={{ from: location.pathname }} />

  // 세션은 있으나 커플 상태 로딩 중 → 깜빡임 방지.
  if (coupleLoading) return <RouteFallback />

  const onboarding = location.pathname === '/onboarding'

  // 토스트는 보호 셸 전역(온보딩 포함)에서 제공 — ConnectPage 등 AppLayout 밖 화면도 useToast 사용.
  // AppLayout은 더는 ToastProvider를 직접 두지 않는다(중첩 방지, 단일 출처).
  const guarded = (node: React.ReactElement) => <ToastProvider>{node}</ToastProvider>

  // 미연결 → 연결(①). 연결되면 곧바로 앱(공유 기본값) — 동의 위저드 없음.
  if (!active) {
    return onboarding ? guarded(<Outlet />) : <Navigate to="/onboarding" replace />
  }
  // ACTIVE인데 온보딩(연결)에 있으면 → 앱으로.
  if (onboarding) return <Navigate to="/" replace />

  return guarded(<Outlet />)
}
