import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/state/auth'
import { RouteFallback } from '@/components/common/RouteFallback'

// 보호 라우트 가드(web-stack.md §4.2 / §7) — 비로그인 → /auth.
// 초기 세션 복원 중에는 깜빡임 방지로 로딩.
// (P0d 이후: couple 미연결 → /onboarding 분기를 여기 한 곳에 추가.)
export function RequireAuth() {
  const { initializing, session } = useAuth()
  const location = useLocation()

  if (initializing) return <RouteFallback />
  if (!session) return <Navigate to="/auth" replace state={{ from: location.pathname }} />

  return <Outlet />
}
