import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import { lazy, Suspense, type ReactNode } from 'react'
import { AppLayout } from '@/app/AppLayout'
import { RouteFallback } from '@/components/common/RouteFallback'
import { RouteError } from '@/components/common/RouteError'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { TABS } from '@/app/tabs'

// 페이지는 React.lazy + Suspense로 코드 스플리팅(무거운 지도/캘린더 지연 로드).
// 경로 → lazy 컴포넌트 매핑(탭 메타는 @/app/tabs 단일 출처, 여기선 청크 경계만 정의).
const PAGES: Record<string, React.LazyExoticComponent<() => React.JSX.Element>> = {
  '/': lazy(() => import('@/pages/MapPage')),
  '/calendar': lazy(() => import('@/pages/CalendarPage')),
  '/trips': lazy(() => import('@/pages/TripsPage')),
  '/discover': lazy(() => import('@/pages/RecommendPage')),
  '/us': lazy(() => import('@/pages/UsPage')),
}

// 인증 페이지(공개) — 가드 밖.
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const PrivacyPolicyPage = lazy(() => import('@/pages/legal/PrivacyPolicyPage'))
const LocationPolicyPage = lazy(() => import('@/pages/legal/LocationPolicyPage'))
const AuthCallbackPage = lazy(() => import('@/pages/auth/AuthCallbackPage'))
// 커플 연결(온보딩) — 가드 안, 단 탭바 없는 풀스크린(AppLayout 밖).
const ConnectPage = lazy(() => import('@/pages/ConnectPage'))
// 여행 리캡(R5) — 가드+탭바 안의 상세 라우트.
const RecapPage = lazy(() => import('@/pages/RecapPage'))
// 여행 상세(Day 계획) — 여행 탭에서 진입. 리캡(/recap)보다 덜 구체적이라 라우트 랭킹상 충돌 없음.
const TripDetailPage = lazy(() => import('@/pages/TripDetailPage'))

function lazyRoute(node: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{node}</Suspense>
}

// 하단 탭바 5개 = 보호 라우트(설계서 §3 IA / web-stack.md §7). TABS에서 도출.
// errorElement: lazy 청크 로드 실패·렌더 오류 시 친근한 재시도 화면(죽은 기본 에러 화면 방지).
const tabRoutes: RouteObject[] = TABS.map((tab) => {
  const Page = PAGES[tab.path]
  if (!Page) throw new Error(`No page component for tab path: ${tab.path}`)
  return tab.index
    ? { index: true, element: lazyRoute(<Page />), errorElement: <RouteError /> }
    : {
        path: tab.path.replace(/^\//, ''),
        element: lazyRoute(<Page />),
        errorElement: <RouteError />,
      }
})

// 라우트 설정 — 테스트에서 createMemoryRouter로 재사용(단일 출처).
export const routes: RouteObject[] = [
  // 공개 인증 경로(가드 밖) — 비로그인도 접근.
  { path: '/auth', element: lazyRoute(<LoginPage />), errorElement: <RouteError /> },
  { path: '/auth/callback', element: lazyRoute(<AuthCallbackPage />), errorElement: <RouteError /> },

  // 법무 문서 — **반드시 가드 밖**이다. App Store Connect의 '개인정보처리방침 URL'과
  // 심사관이 로그인 없이 여기로 온다. 가드 안에 두면 둘 다 /auth로 튕겨 심사에서 막힌다.
  { path: '/privacy', element: lazyRoute(<PrivacyPolicyPage />), errorElement: <RouteError /> },
  { path: '/location-policy', element: lazyRoute(<LocationPolicyPage />), errorElement: <RouteError /> },

  // 앱 셸 = 로그인 + 커플 연결 필요. RequireAuth가 비로그인→/auth, 미연결→/onboarding.
  {
    path: '/',
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      // 온보딩(커플 연결) — 탭바 없는 풀스크린. AppLayout과 형제.
      { path: 'onboarding', element: lazyRoute(<ConnectPage />), errorElement: <RouteError /> },
      {
        element: <AppLayout />,
        children: [
          ...tabRoutes,
          // 여행 리캡 상세(R5) — 추천 탭 '지난 여행'·여행 상세에서 진입(딥링크 가능).
          {
            path: 'trips/:tripId/recap',
            element: lazyRoute(<RecapPage />),
            errorElement: <RouteError />,
          },
          // 여행 상세(Day 계획) — 여행 목록에서 진입(딥링크 가능).
          {
            path: 'trips/:tripId',
            element: lazyRoute(<TripDetailPage />),
            errorElement: <RouteError />,
          },
          // /places는 지도(/)로 통합됨 — 북마크/딥링크 보존용 명시적 리다이렉트.
          { path: 'places', element: <Navigate to="/" replace /> },
          // 미지정(로그인 상태) 경로는 지도(/)로.
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routes, {
  future: { v7_relativeSplatPath: true },
})
