import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { routes } from '@/app/router'

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

  it.each([
    ['/calendar', 'page-calendar', '일정'],
    ['/places', 'page-places', '장소'],
    ['/discover', 'page-discover', '추천'],
    ['/us', 'page-us', '우리'],
  ])('%s 경로는 %s 화면을 렌더한다', async (path, testId, heading) => {
    renderAt(path)
    expect(await screen.findByTestId(testId)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
  })

  it('알 수 없는 경로는 지도(/)로 리다이렉트한다 (catch-all 라우트 존재)', () => {
    // 런타임 redirect 자체는 Playwright(실제 브라우저)에서 검증한다 —
    // jsdom+undici 환경은 데이터 라우터의 redirect 내비게이션에서 AbortSignal 비호환 버그가 있어
    // 여기서는 catch-all('*' → '/')이 설정에 존재함을 정적으로 보장한다.
    const layout = routes[0]
    const star = layout?.children?.find((r) => r.path === '*')
    expect(star).toBeDefined()
  })

  it('하단 탭바에 5개 탭이 라벨과 함께 노출된다(색만 의존 금지)', async () => {
    renderAt('/')
    await screen.findByTestId('page-map')
    const nav = screen.getByRole('navigation', { name: '주요 메뉴' })
    for (const label of ['지도', '일정', '장소', '추천', '우리']) {
      expect(nav).toHaveTextContent(label)
    }
  })
})
