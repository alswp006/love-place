import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
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

describe('5탭 라우팅 (설계서 §3 IA)', () => {
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

  it('하단 탭바에 5개 탭이 라벨과 함께 노출된다(색만 의존 금지)', async () => {
    renderAt('/')
    await screen.findByTestId('page-map')
    const nav = screen.getByRole('navigation', { name: '주요 메뉴' })
    for (const { label } of TABS) {
      expect(nav).toHaveTextContent(label)
    }
  })
})
