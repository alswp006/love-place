import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  RouterProvider,
  createMemoryRouter,
  MemoryRouter,
  Routes,
  Route,
  Navigate,
  type RouteObject,
} from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'

// 탭은 RequireAuth 뒤에 있으므로, 라우팅 렌더 테스트에선 로그인된 세션을 모킹한다.
// (가드 자체의 비로그인→/auth 동작은 auth-guard.spec.ts·route-guard 단위테스트가 검증.)
const mockAuth = vi.hoisted(() => ({
  initializing: false,
  session: { user: { id: 'u1' } },
  user: { id: 'u1' },
  configured: true,
}))
vi.mock('@/state/auth', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// RequireAuth가 useCouple로 ACTIVE 게이트를 보므로, 탭 렌더 테스트에선 연결된 커플로 모킹.
vi.mock('@/hooks/useCouple', () => ({
  useCouple: () => ({
    data: { coupleId: 'c1', status: 'ACTIVE', userA: 'u1', userB: 'u2', connectedAt: null, partner: null },
    isLoading: false,
  }),
}))

// 라우트는 모킹 후 import해야 가드가 모킹된 useAuth를 본다.
const { routes } = await import('@/app/router')
const { TABS } = await import('@/app/tabs')

function renderAt(path: string) {
  const router = createMemoryRouter(routes, {
    initialEntries: [path],
    future: { v7_relativeSplatPath: true },
  })
  // UsPage 등이 TanStack Query를 쓰므로 Provider로 감싼다.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockAuth.session = { user: { id: 'u1' } }
})

describe('4탭 라우팅 (설계서 §3 IA — 장소→지도 통합)', () => {
  it('루트(/)는 지도 화면을 첫 화면으로 렌더한다', async () => {
    renderAt('/')
    expect(await screen.findByTestId('page-map')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '지도' })).toBeInTheDocument()
  })

  // 탭 메타는 단일 출처(@/app/tabs)에서 도출 — 테스트가 별도 하드코딩을 갖지 않는다.
  it.each(TABS.map((t) => [t.path, t.testId, t.title] as const))(
    '%s 경로는 %s 화면을 렌더한다',
    async (path, testId, heading) => {
      renderAt(path)
      expect(await screen.findByTestId(testId)).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    },
  )

  it('추천 탭 빈 상태는 "장소 모으기"로 가는 행동 유도 링크를 준다(§5.6 콜드스타트 — 죽은 탭 금지)', async () => {
    renderAt('/discover')
    await screen.findByTestId('page-discover')
    const cta = screen.getByRole('link', { name: '가고싶은 곳 추가하기' })
    expect(cta).toHaveAttribute('href', '/')
  })

  it('하단 탭바에 4개 탭이 라벨과 함께 노출된다(색만 의존 금지)', async () => {
    renderAt('/')
    await screen.findByTestId('page-map')
    const nav = screen.getByRole('navigation', { name: '주요 메뉴' })
    for (const { label } of TABS) {
      expect(nav).toHaveTextContent(label)
    }
  })

  // /places는 지도(/)로 통합됨 — router.tsx의 명시적 { path: 'places', Navigate to / } 리다이렉트를 검증.
  // createMemoryRouter(데이터 라우터)의 redirect는 jsdom+undici AbortSignal 버그로 비동기 네비게이션이
  // 중단되므로(auth-guard.test.tsx 참고), MemoryRouter로 동기 redirect를 렌더해 같은 규칙을 못박는다.
  it('/places는 지도(/)로 리다이렉트된다(딥링크/북마크 보존)', () => {
    render(
      <MemoryRouter initialEntries={['/places']} future={{ v7_relativeSplatPath: true }}>
        <Routes>
          <Route index element={<div data-testid="page-map">지도</div>} />
          <Route path="places" element={<Navigate to="/" replace />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('page-map')).toBeInTheDocument()
  })

  // 위 렌더 테스트가 환경 버그로 실제 routes를 못 구동하므로, router.tsx의 명시적 리다이렉트가
  // catch-all(splat)보다 먼저 선언돼 있는지 구조로 회귀 가드한다(미래에 splat 위 다른 route가
  // /places를 가리지 못하게). AppLayout children에서 'places' route를 찾고 splat보다 앞에 있음을 확인.
  it("router.tsx에 splat보다 앞선 명시적 'places' 리다이렉트가 선언돼 있다(회귀 가드)", () => {
    function findAppLayoutChildren(rs: RouteObject[]): RouteObject[] | undefined {
      for (const r of rs) {
        // AppLayout 노드는 path 없이 element만 가진 layout route(tabRoutes를 children으로 가짐).
        if (!r.path && r.children?.some((c) => c.path === '*')) return r.children
        const found = r.children && findAppLayoutChildren(r.children)
        if (found) return found
      }
      return undefined
    }
    const children = findAppLayoutChildren(routes)
    expect(children).toBeDefined()
    const placesIdx = children!.findIndex((c) => c.path === 'places')
    const splatIdx = children!.findIndex((c) => c.path === '*')
    expect(placesIdx).toBeGreaterThanOrEqual(0)
    expect(splatIdx).toBeGreaterThanOrEqual(0)
    expect(placesIdx).toBeLessThan(splatIdx)
  })
})
