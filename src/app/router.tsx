import {
  createBrowserRouter,
  Navigate,
  type RouteObject,
} from 'react-router-dom'
import { lazy, Suspense, type ReactNode } from 'react'
import { AppLayout } from '@/app/AppLayout'
import { RouteFallback } from '@/components/common/RouteFallback'
import { RouteError } from '@/components/common/RouteError'
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

function lazyRoute(node: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{node}</Suspense>
}

// 하단 탭바 5개 = 최상위 라우트(설계서 §3 IA / web-stack.md §7). TABS에서 도출.
// errorElement: lazy 청크 로드 실패·렌더 오류 시 친근한 재시도 화면(죽은 기본 에러 화면 방지).
const tabRoutes: RouteObject[] = TABS.map((tab) => {
  const Page = PAGES[tab.path]
  if (!Page) throw new Error(`No page component for tab path: ${tab.path}`)
  return tab.index
    ? { index: true, element: lazyRoute(<Page />), errorElement: <RouteError /> }
    : { path: tab.path.replace(/^\//, ''), element: lazyRoute(<Page />), errorElement: <RouteError /> }
})

// 라우트 설정 — 테스트에서 createMemoryRouter로 재사용(단일 출처).
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      ...tabRoutes,
      // 미지정 경로는 지도(/)로. (P0b에서 /auth·/onboarding 가드는 layout loader redirect로 추가 —
      // loader redirect가 자식 렌더보다 먼저 short-circuit하므로 이 catch-all과 경합하지 않음.)
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]

export const router = createBrowserRouter(routes, {
  future: { v7_relativeSplatPath: true },
})
