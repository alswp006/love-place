import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/state/auth'
import { useCouple } from '@/hooks/useCouple'
import { useConsent } from '@/hooks/useConsent'
import { RouteFallback } from '@/components/common/RouteFallback'
import { ToastProvider } from '@/components/common/ToastProvider'

// 보호 라우트 가드(web-stack.md §4.2) — 비로그인 → /auth, 미연결 → /onboarding(①),
// 연결됐으나 ②③ 동의 미기록 → /onboarding/steps(인비터·억셉터 둘 다 우회 불가, security-privacy §3.2).
export function RequireAuth() {
  const { initializing, session } = useAuth()
  const { data: couple, isLoading: coupleLoading } = useCouple()
  const location = useLocation()
  const active = couple?.status === 'ACTIVE'
  // 동의 쿼리는 ACTIVE일 때만 발사(미연결 사용자에겐 불필요). 로딩 전엔 consentRecorded=false 취급.
  const { consentRecorded, isLoading: consentLoading } = useConsent({ enabled: active })

  if (initializing) return <RouteFallback />
  if (!session) return <Navigate to="/auth" replace state={{ from: location.pathname }} />

  // 세션은 있으나 커플 상태 로딩 중 → 깜빡임 방지.
  if (coupleLoading) return <RouteFallback />

  const onboarding = location.pathname === '/onboarding'
  const onboardingSteps = location.pathname === '/onboarding/steps'

  // 토스트는 보호 셸 전역(온보딩 포함)에서 제공 — ConnectPage 등 AppLayout 밖 화면도 useToast 사용.
  // AppLayout은 더는 ToastProvider를 직접 두지 않는다(중첩 방지, 단일 출처).
  const guarded = (node: React.ReactElement) => <ToastProvider>{node}</ToastProvider>

  // 미연결 → 연결(①). 연결은 됐는데 ①만 있고 ②③ 동의 미기록 → steps 강제(인비터·억셉터 둘 다).
  if (!active) {
    return onboarding ? guarded(<Outlet />) : <Navigate to="/onboarding" replace />
  }
  if (consentLoading) return <RouteFallback />
  if (!consentRecorded) {
    return onboardingSteps ? guarded(<Outlet />) : <Navigate to="/onboarding/steps" replace />
  }
  // ACTIVE + 동의 완료인데 온보딩/스텝에 있으면 → 앱으로.
  if (onboarding || onboardingSteps) return <Navigate to="/" replace />

  return guarded(<Outlet />)
}
