import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/state/auth'
import { useCouple } from '@/hooks/useCouple'
import { RouteFallback } from '@/components/common/RouteFallback'

// 보호 라우트 가드(web-stack.md §4.2) — 비로그인 → /auth, couple 미연결(ACTIVE 아님) → /onboarding.
export function RequireAuth() {
  const { initializing, session } = useAuth()
  const { data: couple, isLoading: coupleLoading } = useCouple()
  const location = useLocation()

  if (initializing) return <RouteFallback />
  if (!session) return <Navigate to="/auth" replace state={{ from: location.pathname }} />

  // 세션은 있으나 커플 상태 로딩 중 → 깜빡임 방지.
  if (coupleLoading) return <RouteFallback />

  const onboarding = location.pathname === '/onboarding'
  const active = couple?.status === 'ACTIVE'

  // 미연결인데 온보딩이 아니면 → 온보딩으로(연결 전엔 앱 못 들어감).
  if (!active && !onboarding) return <Navigate to="/onboarding" replace />
  // 이미 연결됐는데 온보딩에 있으면 → 앱으로.
  if (active && onboarding) return <Navigate to="/" replace />

  return <Outlet />
}
