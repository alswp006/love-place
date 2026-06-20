import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// 동의 인지 가드 — useAuth/useCouple/useConsent를 가변 모킹해 (연결·동의) 조합별 리다이렉트를 검증.
const state = vi.hoisted(() => ({
  initializing: false,
  session: null as { user: { id: string } } | null,
  coupleStatus: null as 'PENDING' | 'ACTIVE' | 'DISCONNECTED' | null,
  coupleLoading: false,
  consentRecorded: false,
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
    data: { coupleId: state.coupleStatus ? 'c1' : null, status: state.coupleStatus, partner: null, myRole: 'user_a' },
    isLoading: state.coupleLoading,
  }),
}))
vi.mock('@/hooks/useConsent', () => ({
  useConsent: () => ({ consentRecorded: state.consentRecorded, isLoading: state.consentLoading }),
}))

const { RequireAuth } = await import('@/components/auth/RequireAuth')

// MemoryRouter는 redirect를 동기 렌더로 처리 → jsdom+undici AbortSignal 버그 회피.
function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route index element={<div data-testid="app">앱</div>} />
          <Route path="onboarding" element={<div data-testid="onboarding">연결</div>} />
          <Route path="onboarding/steps" element={<div data-testid="steps">동의단계</div>} />
        </Route>
        <Route path="/auth" element={<div data-testid="login">로그인</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.initializing = false
  state.session = { user: { id: 'u1' } }
  state.coupleStatus = 'ACTIVE'
  state.coupleLoading = false
  state.consentRecorded = false
  state.consentLoading = false
})

describe('RequireAuth 동의 인지 가드 (R3 T8a)', () => {
  it('(a) ACTIVE + 동의 미기록 + / 에 있으면 → /onboarding/steps', () => {
    state.consentRecorded = false
    renderAt('/')
    expect(screen.getByTestId('steps')).toBeInTheDocument()
    expect(screen.queryByTestId('app')).not.toBeInTheDocument()
  })

  it('(b) ACTIVE + 동의 미기록 + /onboarding/steps 에 있으면 → 머무름(/로 튕기지 않음)', () => {
    state.consentRecorded = false
    renderAt('/onboarding/steps')
    expect(screen.getByTestId('steps')).toBeInTheDocument()
    expect(screen.queryByTestId('app')).not.toBeInTheDocument()
  })

  it('(c) ACTIVE + 동의 완료 + /onboarding(/steps) 에 있으면 → /', () => {
    state.consentRecorded = true
    renderAt('/onboarding')
    expect(screen.getByTestId('app')).toBeInTheDocument()
  })

  it('(c2) ACTIVE + 동의 완료 + /onboarding/steps → /', () => {
    state.consentRecorded = true
    renderAt('/onboarding/steps')
    expect(screen.getByTestId('app')).toBeInTheDocument()
  })

  it('(d) 세션 있으나 not-ACTIVE면 → /onboarding(연결, 종전 동작)', () => {
    state.coupleStatus = 'PENDING'
    renderAt('/')
    expect(screen.getByTestId('onboarding')).toBeInTheDocument()
    expect(screen.queryByTestId('app')).not.toBeInTheDocument()
  })

  it('(e) 인비터: ACTIVE + 동의 미기록 + /(연결 페이지를 거치지 않음)도 → /onboarding/steps(동의 우회 불가)', () => {
    state.consentRecorded = false
    renderAt('/')
    expect(screen.getByTestId('steps')).toBeInTheDocument()
  })

  it('동의 로딩 중에는 리다이렉트하지 않고 폴백(깜빡임 방지)', () => {
    state.consentLoading = true
    state.consentRecorded = false
    renderAt('/')
    expect(screen.queryByTestId('app')).not.toBeInTheDocument()
    expect(screen.queryByTestId('steps')).not.toBeInTheDocument()
  })
})
