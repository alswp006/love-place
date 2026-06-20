import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { PlaceRow } from '@/hooks/usePlaces'
import type { VisitRow } from '@/hooks/useVisits'

// RecommendPage·UsPage 로딩 스켈레톤 분기 검증(Task 9): 데이터 훅의 isLoading 미사용 →
// 콜드스타트 플래시(빈 상태 깜빡 후 데이터). isLoading:true면 Skeleton(role=status, label),
// isLoading:false + 빈 데이터면 기존 콜드스타트 EmptyState/SEED 유지.
// 데이터 훅을 mock하되, 모듈 레벨 가변 상태로 각 테스트가 couple/places/visits를 바꾼다.

type CoupleState = { status: 'ACTIVE' | 'PENDING' | 'DISCONNECTED'; isLoading: boolean }
let coupleState: CoupleState = { status: 'ACTIVE', isLoading: false }
let placesState: { data: PlaceRow[]; isLoading: boolean } = { data: [], isLoading: false }
let visitsState: { data: VisitRow[]; isLoading: boolean } = { data: [], isLoading: false }

vi.mock('@/state/auth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, session: { user: { id: 'u1' } }, configured: true, initializing: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/hooks/useCouple', () => ({
  useCouple: () => ({
    data: { coupleId: 'c1', status: coupleState.status, userA: 'u1', userB: 'u2', connectedAt: null, partner: null },
    isLoading: coupleState.isLoading,
  }),
}))
vi.mock('@/hooks/usePlaces', () => ({ usePlaces: () => placesState }))
vi.mock('@/hooks/useVisits', () => ({ useVisits: () => visitsState }))
vi.mock('@/hooks/useEventMutations', () => ({
  useEventMutations: () => ({
    addCourse: { mutateAsync: vi.fn(), isPending: false },
  }),
}))

import RecommendPage from '@/pages/RecommendPage'
import { ToastProvider } from '@/components/common/ToastProvider'

function renderRecommend() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <RecommendPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('RecommendPage 로딩 스켈레톤(Task 9)', () => {
  beforeEach(() => {
    coupleState = { status: 'ACTIVE', isLoading: false }
    placesState = { data: [], isLoading: false }
    visitsState = { data: [], isLoading: false }
  })

  it('로딩 중(ACTIVE & places isLoading) → role="status" 스켈레톤 노출, 콜드스타트 SEED 미노출', () => {
    placesState = { data: [], isLoading: true }
    renderRecommend()
    // 스켈레톤(role=status, aria-label) — ToastProvider 뷰포트도 role=status라 라벨로 특정.
    expect(screen.getByRole('status', { name: '추천 불러오는 중' })).toBeInTheDocument()
    // 스켈레톤일 땐 콜드스타트 EmptyState/SEED가 없어야 한다(플래시 제거).
    expect(screen.queryByText('이런 여행은 어때요?')).not.toBeInTheDocument()
  })

  it('로딩 중(visits isLoading)도 스켈레톤 노출', () => {
    visitsState = { data: [], isLoading: true }
    renderRecommend()
    expect(screen.getByRole('status', { name: '추천 불러오는 중' })).toBeInTheDocument()
  })

  it('로딩 끝 + 빈 데이터(ACTIVE & isLoading:false) → 기존 콜드스타트 SEED 유지(회귀)', () => {
    renderRecommend()
    expect(screen.queryByRole('status', { name: '추천 불러오는 중' })).not.toBeInTheDocument()
    expect(screen.getByText('이런 여행은 어때요?')).toBeInTheDocument()
  })
})
