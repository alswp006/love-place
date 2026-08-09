import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// ⚠️ 이 파일의 계약은 0024에서 **의도적으로 바뀌었다.**
//
// 이전: 로그인해도 ACTIVE 커플이 없으면 무조건 /onboarding에 갇혔다("미연결 = 통과 불가").
// 이후: 연결은 관문이 아니다. 한 사람이 먼저 쓰는 경우가 흔한데 예전엔 아무것도 못 봤다.
//       ACTIVE가 없으면 가드가 ensure_solo_couple로 '혼자짜리 커플'을 깔고 앱으로 들여보낸다.
//       /onboarding은 우리 탭에서 자발적으로 찾아가는 화면이 됐다.
//
// 그래서 옛 케이스(미연결→/onboarding, PENDING→/onboarding)는 삭제가 아니라 **대체**됐다.
// 남는 리다이렉트는 두 가지뿐이다: 비로그인→/auth, 그리고 ensure가 끝내 실패했을 때→/onboarding.
const state = vi.hoisted(() => ({
  initializing: false,
  session: null as { user: { id: string } } | null,
  coupleStatus: null as 'PENDING' | 'ACTIVE' | 'DISCONNECTED' | null,
  partner: null as { id: string } | null,
  coupleLoading: false,
  ensureState: 'done' as 'idle' | 'running' | 'done' | 'failed',
  ensureNeeded: [] as boolean[],
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
    data: {
      coupleId: state.coupleStatus ? 'c1' : null,
      status: state.coupleStatus,
      partner: state.partner,
      isSolo: state.coupleStatus === 'ACTIVE' && !state.partner,
    },
    isLoading: state.coupleLoading,
  }),
}))
vi.mock('@/hooks/useEnsureCouple', () => ({
  useEnsureCouple: (opts: { needed: boolean }) => {
    state.ensureNeeded.push(opts.needed)
    return { state: state.ensureState }
  },
}))
const { RequireAuth } = await import('@/components/auth/RequireAuth')

// MemoryRouter는 redirect를 동기 렌더로 처리 → jsdom+undici AbortSignal 버그 회피.
function renderGuard(at = '/') {
  render(
    <MemoryRouter initialEntries={[at]} future={{ v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route index element={<div data-testid="protected">보호됨</div>} />
          <Route path="onboarding" element={<div data-testid="onboarding">연결</div>} />
        </Route>
        <Route path="/auth" element={<div data-testid="login">로그인</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.initializing = false
  state.session = null
  state.coupleStatus = null
  state.partner = null
  state.coupleLoading = false
  state.ensureState = 'done'
  state.ensureNeeded = []
})

describe('RequireAuth — 로그인만이 관문이다', () => {
  it('비로그인이면 /auth(로그인)로 보낸다', () => {
    state.session = null
    renderGuard()
    expect(screen.getByTestId('login')).toBeInTheDocument()
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
  })

  it('초기화 중에는 리다이렉트하지 않고 로딩(깜빡임 방지)', () => {
    state.initializing = true
    renderGuard()
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
    expect(screen.queryByTestId('login')).not.toBeInTheDocument()
  })

  it('커플 상태 로딩 중에도 리다이렉트하지 않는다', () => {
    state.session = { user: { id: 'u1' } }
    state.coupleLoading = true
    renderGuard()
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
    expect(screen.queryByTestId('onboarding')).not.toBeInTheDocument()
  })
})

describe('RequireAuth — 혼자여도 앱에 들어간다(0024)', () => {
  it('상대가 있는 ACTIVE는 앱으로', () => {
    state.session = { user: { id: 'u1' } }
    state.coupleStatus = 'ACTIVE'
    state.partner = { id: 'u2' }
    renderGuard()
    expect(screen.getByTestId('protected')).toBeInTheDocument()
  })

  it('상대가 없는 ACTIVE(혼자)도 앱으로 — 예전엔 여기서 막혔다', () => {
    state.session = { user: { id: 'u1' } }
    state.coupleStatus = 'ACTIVE'
    state.partner = null
    renderGuard()
    expect(screen.getByTestId('protected')).toBeInTheDocument()
    expect(screen.queryByTestId('onboarding')).not.toBeInTheDocument()
  })

  it('ACTIVE가 없으면 솔로 커플을 만들어 달라고 요청한다', () => {
    state.session = { user: { id: 'u1' } }
    state.coupleStatus = null
    state.ensureState = 'running'
    renderGuard()
    expect(state.ensureNeeded.some(Boolean)).toBe(true)
  })

  it('만드는 중에는 로딩 — 연결 화면을 스쳐 보여주지 않는다', () => {
    state.session = { user: { id: 'u1' } }
    state.coupleStatus = null
    state.ensureState = 'running'
    renderGuard()
    expect(screen.queryByTestId('onboarding')).not.toBeInTheDocument()
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
  })

  it('ACTIVE가 이미 있으면 만들어 달라고 하지 않는다', () => {
    state.session = { user: { id: 'u1' } }
    state.coupleStatus = 'ACTIVE'
    renderGuard()
    expect(state.ensureNeeded.every((n) => n === false)).toBe(true)
  })

  it('끝내 못 만들면(권한·네트워크) 그때는 연결 화면 — 유일하게 의미 있는 화면', async () => {
    state.session = { user: { id: 'u1' } }
    state.coupleStatus = null
    state.ensureState = 'failed'
    renderGuard()
    await waitFor(() => expect(screen.getByTestId('onboarding')).toBeInTheDocument())
  })
})

describe('RequireAuth — /onboarding 접근', () => {
  it('혼자면 연결 화면에 들어갈 수 있다(우리 탭에서 찾아온 경로)', () => {
    state.session = { user: { id: 'u1' } }
    state.coupleStatus = 'ACTIVE'
    state.partner = null
    renderGuard('/onboarding')
    expect(screen.getByTestId('onboarding')).toBeInTheDocument()
  })

  it('이미 상대가 있으면 앱으로 돌려보낸다 — 연결할 것이 없다', () => {
    state.session = { user: { id: 'u1' } }
    state.coupleStatus = 'ACTIVE'
    state.partner = { id: 'u2' }
    renderGuard('/onboarding')
    expect(screen.getByTestId('protected')).toBeInTheDocument()
    expect(screen.queryByTestId('onboarding')).not.toBeInTheDocument()
  })
})
