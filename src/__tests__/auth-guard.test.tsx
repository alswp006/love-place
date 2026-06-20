import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// useAuth + useCouple을 가변 모킹해 로그인·커플 상태 조합을 검증.
const state = vi.hoisted(() => ({
  initializing: false,
  session: null as { user: { id: string } } | null,
  coupleStatus: null as 'PENDING' | 'ACTIVE' | 'DISCONNECTED' | null,
  coupleLoading: false,
  // 동의 가드(T8a)는 ACTIVE에서만 발사 — 여기선 ACTIVE 경로가 보호 화면을 보이도록 동의 완료로 둔다.
  consentRecorded: true,
  consentLoading: false,
}))
vi.mock('@/state/auth', () => ({
  useAuth: () => ({
    initializing: state.initializing,
    session: state.session,
    user: state.session?.user ?? null,
    configured: true,
  }),
}))
vi.mock('@/hooks/useCouple', () => ({
  useCouple: () => ({
    data: { coupleId: state.coupleStatus ? 'c1' : null, status: state.coupleStatus, partner: null },
    isLoading: state.coupleLoading,
  }),
}))
vi.mock('@/hooks/useConsent', () => ({
  useConsent: () => ({ consentRecorded: state.consentRecorded, isLoading: state.consentLoading }),
}))

const { RequireAuth } = await import('@/components/auth/RequireAuth')

// MemoryRouter는 redirect를 동기 렌더로 처리 → jsdom+undici AbortSignal 버그 회피.
function renderGuard() {
  render(
    <MemoryRouter initialEntries={['/']} future={{ v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route index element={<div data-testid="protected">보호됨</div>} />
        </Route>
        <Route path="/auth" element={<div data-testid="login">로그인</div>} />
        <Route path="/onboarding" element={<div data-testid="onboarding">연결</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.initializing = false
  state.session = null
  state.coupleStatus = null
  state.coupleLoading = false
  state.consentRecorded = true
  state.consentLoading = false
})

describe('RequireAuth 보호 라우트', () => {
  it('비로그인이면 /auth(로그인)로 보낸다', () => {
    state.session = null
    renderGuard()
    expect(screen.getByTestId('login')).toBeInTheDocument()
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
  })

  it('로그인+커플 ACTIVE면 보호된 화면을 보여준다', () => {
    state.session = { user: { id: 'u1' } }
    state.coupleStatus = 'ACTIVE'
    renderGuard()
    expect(screen.getByTestId('protected')).toBeInTheDocument()
  })

  it('로그인했으나 커플 미연결(null)이면 /onboarding으로 보낸다', () => {
    state.session = { user: { id: 'u1' } }
    state.coupleStatus = null
    renderGuard()
    expect(screen.getByTestId('onboarding')).toBeInTheDocument()
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
  })

  it('커플 PENDING(초대만 함)도 미연결이라 /onboarding', () => {
    state.session = { user: { id: 'u1' } }
    state.coupleStatus = 'PENDING'
    renderGuard()
    expect(screen.getByTestId('onboarding')).toBeInTheDocument()
  })

  it('초기화 중에는 리다이렉트하지 않고 로딩(깜빡임 방지)', () => {
    state.initializing = true
    renderGuard()
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
    expect(screen.queryByTestId('login')).not.toBeInTheDocument()
  })
})
