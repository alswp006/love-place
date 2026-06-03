import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// useAuth를 가변 모킹해 로그인/비로그인/초기화중 3상태를 검증.
const state = vi.hoisted(() => ({
  initializing: false,
  session: null as { user: { id: string } } | null,
}))
vi.mock('@/state/auth', () => ({
  useAuth: () => ({
    initializing: state.initializing,
    session: state.session,
    user: state.session?.user ?? null,
    configured: true,
  }),
}))

const { RequireAuth } = await import('@/components/auth/RequireAuth')

// MemoryRouter(컴포넌트 라우터)는 redirect를 동기 렌더로 처리 → jsdom+undici의
// 데이터 라우터 AbortSignal 버그를 피하면서 가드 동작을 검증한다.
function renderGuard() {
  render(
    <MemoryRouter initialEntries={['/']} future={{ v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route index element={<div data-testid="protected">보호됨</div>} />
        </Route>
        <Route path="/auth" element={<div data-testid="login">로그인</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.initializing = false
  state.session = null
})

describe('RequireAuth 보호 라우트', () => {
  it('비로그인이면 /auth(로그인)로 보낸다', () => {
    state.session = null
    renderGuard()
    expect(screen.getByTestId('login')).toBeInTheDocument()
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
  })

  it('로그인 상태면 보호된 화면을 보여준다', () => {
    state.session = { user: { id: 'u1' } }
    renderGuard()
    expect(screen.getByTestId('protected')).toBeInTheDocument()
    expect(screen.queryByTestId('login')).not.toBeInTheDocument()
  })

  it('초기화 중에는 리다이렉트하지 않고 로딩을 보여준다(깜빡임 방지)', () => {
    state.initializing = true
    state.session = null
    renderGuard()
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
    expect(screen.queryByTestId('login')).not.toBeInTheDocument()
  })
})
