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
  '/places': lazy(() => import('@/pages/PlacesPage')),
  '/discover': lazy(() => import('@/pages/RecommendPage')),
  '/us': lazy(() => import('@/pages/UsPage')),
}

// 인증 페이지(공개) — 가드 밖.
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const AuthCallbackPage = lazy(() => import('@/pages/auth/AuthCallbackPage'))
// 커플 연결(온보딩) — 가드 안, 단 탭바 없는 풀스크린(AppLayout 밖).
const ConnectPage = lazy(() => import('@/pages/ConnectPage'))

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
