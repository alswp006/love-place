import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { PlaceRow } from '@/hooks/usePlaces'
import type { VisitRow } from '@/hooks/useVisits'

// Task 23: RecommendPage 죽은 텍스트(retro/SEED) 가능화.
// SEED "이런 여행"은 add-place(`/?q=<regionLabel>`)로 탭 가능한 링크(CtaLink),
// retro "다시 보기"는 방문지 필터 라우트가 R4에 없으므로 option B — "곧 제공" 배지
// (text+icon, aria-disabled). 둘 중 택일을 테스트로 고정한다.

let placesState: { data: PlaceRow[]; isLoading: boolean } = { data: [], isLoading: false }
let visitsState: { data: VisitRow[]; isLoading: boolean } = { data: [], isLoading: false }

vi.mock('@/state/auth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, session: { user: { id: 'u1' } }, configured: true, initializing: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/hooks/useCouple', () => ({
  useCouple: () => ({
    data: { coupleId: 'c1', status: 'ACTIVE', userA: 'u1', userB: 'u2', connectedAt: null, partner: null },
    isLoading: false,
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

function place(id: string, name: string, region: string, lat: number, lng: number): PlaceRow {
  return {
    id,
    couple_id: 'c1',
    name,
    address: `${region} 어딘가`,
    road_address: null,
    region_code: region,
    region_label: region,
    lat,
    lng,
    kakao_place_id: null,
    category: null,
    created_by: 'u1',
    updated_by: 'u1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    version: 1,
  } as unknown as PlaceRow
}

function visit(id: string, placeId: string): VisitRow {
  return {
    id,
    couple_id: 'c1',
    place_id: placeId,
    visited_on: '2026-01-01',
    trip_id: null,
    created_by: 'u1',
    updated_by: 'u1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    version: 1,
  } as unknown as VisitRow
}

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

describe('RecommendPage CTA 가능화(Task 23)', () => {
  beforeEach(() => {
    placesState = { data: [], isLoading: false }
    visitsState = { data: [], isLoading: false }
  })

  it('SEED "이런 여행" 항목이 add-place(/?q=<regionLabel>)로 탭 가능한 링크', () => {
    renderRecommend()
    const seedSection = screen.getByRole('region', { name: '추천 시작' })
    // 첫 SEED 항목(속초 · 강릉) → /?q=속초%20%C2%B7%20강릉
    const link = within(seedSection).getByRole('link', { name: /속초 · 강릉/ })
    expect(link).toHaveAttribute('href', `/?q=${encodeURIComponent('속초 · 강릉')}`)
  })

  it('retro "다시 보기"는 라우트 미존재 → "곧 제공" 배지(text+icon, aria-disabled)', () => {
    placesState = {
      data: [place('p1', '바다카페', '속초', 38.2, 128.5), place('p2', '오징어', '속초', 38.21, 128.51)],
      isLoading: false,
    }
    visitsState = { data: [visit('v1', 'p1'), visit('v2', 'p2')], isLoading: false }
    renderRecommend()
    const retroSection = screen.getByRole('region', { name: '다시 가보기' })
    // 색 비의존: "곧 제공" 텍스트 + aria-disabled로 탭 불가 명시
    expect(within(retroSection).getByText('곧 제공')).toBeInTheDocument()
    const retro = retroSection.querySelector('[aria-disabled="true"]')
    expect(retro).not.toBeNull()
    // 죽은 retro가 링크/버튼이 아니어야(가짜 탭 가능성 방지)
    expect(within(retroSection).queryByRole('link')).toBeNull()
    expect(within(retroSection).queryByRole('button')).toBeNull()
  })
})
