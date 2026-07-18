import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '@/components/common/ToastProvider'

// UsPage 로딩 스켈레톤 분기 검증(Task 9): useCouple isLoading:true면 페이지 스켈레톤(role=status, label),
// isLoading:false면 기존 프로필/연결 블록 렌더(회귀). 모듈 레벨 가변 상태로 isLoading을 바꾼다.

let coupleLoading = false

vi.mock('@/state/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'me@x.com' }, session: { user: { id: 'u1' } }, configured: true, initializing: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/hooks/useCouple', () => ({
  useCouple: () => ({
    data: { coupleId: 'c1', status: 'ACTIVE', userA: 'u1', userB: 'u2', connectedAt: null, partner: null },
    isLoading: coupleLoading,
  }),
}))
vi.mock('@/hooks/useSignOut', () => ({ useSignOut: () => () => {} }))
vi.mock('@/hooks/useCoupleInvite', () => ({ useDisconnectCouple: () => ({ mutate: () => {}, isPending: false }) }))
vi.mock('@/hooks/useTrash', async (orig) => {
  const real = await orig<typeof import('@/hooks/useTrash')>()
  return {
    ...real,
    useTrash: () => ({ data: [] }),
    useRestore: () => ({ restore: vi.fn(), isPending: false }),
  }
})
vi.mock('@/components/profile/ProfileEditor', () => ({ ProfileEditor: () => null }))

import { OfflineQueueProvider } from '@/state/OfflineQueueProvider'
import UsPage from '@/pages/UsPage'

function renderUs() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <OfflineQueueProvider>
        <ToastProvider><MemoryRouter>
          <UsPage />
        </MemoryRouter></ToastProvider>
      </OfflineQueueProvider>
    </QueryClientProvider>,
  )
}

describe('UsPage 로딩 스켈레톤(Task 9)', () => {
  beforeEach(() => {
    coupleLoading = false
  })

  it('로딩 중(useCouple isLoading) → role="status" 스켈레톤 노출, 내 계정 블록 미노출', () => {
    coupleLoading = true
    renderUs()
    expect(screen.getByRole('status', { name: '우리 정보 불러오는 중' })).toBeInTheDocument()
    // 스켈레톤일 땐 로그인 행(내 이메일)이 없어야 한다(플래시 제거).
    expect(screen.queryByText('me@x.com')).not.toBeInTheDocument()
  })

  it('로딩 끝(isLoading:false) → 기존 내 계정 블록 렌더(회귀)', () => {
    renderUs()
    expect(screen.queryByRole('status', { name: '우리 정보 불러오는 중' })).not.toBeInTheDocument()
    expect(screen.getByText('me@x.com')).toBeInTheDocument()
  })
})
