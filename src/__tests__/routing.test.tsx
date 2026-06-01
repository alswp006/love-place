import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { routes } from '@/app/router'
import { TABS } from '@/app/tabs'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, {
    initialEntries: [path],
    future: { v7_relativeSplatPath: true },
  })
  return render(<RouterProvider router={router} />)
}

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

  it('알 수 없는 경로용 catch-all 라우트가 / 로 보낸다', () => {
    // 런타임 redirect 자체는 Playwright(실제 브라우저)에서 검증 —
    // jsdom+undici는 데이터 라우터 redirect 내비게이션에서 AbortSignal 비호환 버그가 있어
    // 여기서는 catch-all('*')이 존재하고 그 목적지가 '/'임을 정적으로 보장한다.
    const layout = routes[0]
    const star = layout?.children?.find((r) => r.path === '*')
    expect(star).toBeDefined()
    // element가 Navigate(to='/')인지 props로 확인(존재만이 아니라 목적지까지).
    const props = (star?.element as { props?: { to?: string } } | undefined)?.props
    expect(props?.to).toBe('/')
  })

  it('하단 탭바에 5개 탭이 라벨과 함께 노출된다(색만 의존 금지)', async () => {
    renderAt('/')
    await screen.findByTestId('page-map')
    const nav = screen.getByRole('navigation', { name: '주요 메뉴' })
    for (const { label } of TABS) {
      expect(nav).toHaveTextContent(label)
    }
  })
})
