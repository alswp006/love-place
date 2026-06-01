import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { AppLayout } from '@/app/AppLayout'
import { RouteFallback } from '@/components/common/RouteFallback'

// 하단 탭바 5개 = 최상위 라우트(설계서 §3 IA / web-stack.md §7).
// 페이지는 React.lazy + Suspense로 코드 스플리팅(무거운 지도/캘린더 지연 로드).
const MapPage = lazy(() => import('@/pages/MapPage'))
const CalendarPage = lazy(() => import('@/pages/CalendarPage'))
const PlacesPage = lazy(() => import('@/pages/PlacesPage'))
const RecommendPage = lazy(() => import('@/pages/RecommendPage'))
const UsPage = lazy(() => import('@/pages/UsPage'))

function lazyRoute(node: React.ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{node}</Suspense>
}

// 라우트 설정 — 테스트에서 createMemoryRouter로 재사용(가드 추가 시 단일 출처).
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: lazyRoute(<MapPage />) }, // 첫 화면 = 지도
      { path: 'calendar', element: lazyRoute(<CalendarPage />) },
      { path: 'places', element: lazyRoute(<PlacesPage />) },
      { path: 'discover', element: lazyRoute(<RecommendPage />) },
      { path: 'us', element: lazyRoute(<UsPage />) },
      // TODO(P0b): /auth, /onboarding 가드 추가(비로그인→/auth, couple 미연결→/onboarding).
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]

export const router = createBrowserRouter(routes, {
  future: { v7_relativeSplatPath: true },
})
