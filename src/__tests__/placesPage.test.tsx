import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { PlaceRow } from '@/hooks/usePlaces'
import type { VisitRow } from '@/hooks/useVisits'

// 장소 탭(2026-08, 옛 '추천' 탭 대체) — 담은 곳을 지역별로 모아 보고 찾고, 3곳 이상 모이면 코스를 짠다.
// 여기서 못 박는 것: 지역 그룹핑 · 임계치에 따른 CTA 분기 · 검색 · 상태×검색 교차 · 다층 빈 상태.

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
vi.mock('@/hooks/useWishes', () => ({ useWishes: () => ({ data: { byPlace: {}, mine: {} } }) }))
vi.mock('@/hooks/useVisits', () => ({
  useVisits: () => visitsState,
  useMarkVisited: () => ({ mutate: vi.fn(), isPending: false }),
  useUnmarkVisited: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/usePhotos', () => ({
  usePhotosByPlace: () => new Map(),
  useSignedPhotoUrls: () => ({ data: {} }),
}))
vi.mock('@/hooks/useSetWishPriority', () => ({
  useSetWishPriority: () => ({ setPriority: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/useToggleWish', () => ({ useToggleWish: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/usePlaceTrash', () => ({
  useDeletePlace: () => ({ deletePlace: vi.fn(), isPending: false }),
  useRestorePlace: () => ({ restorePlace: vi.fn() }),
}))
vi.mock('@/hooks/useRealtimePlaces', () => ({ useRealtimePlaces: () => {} }))
vi.mock('@/hooks/useEventMutations', () => ({
  useEventMutations: () => ({ addCourse: { mutateAsync: vi.fn(), isPending: false } }),
}))

import PlacesPage from '@/pages/PlacesPage'
import { ToastProvider } from '@/components/common/ToastProvider'

const place = (id: string, name: string, region: string, extra: Partial<PlaceRow> = {}): PlaceRow =>
  ({
    id,
    name,
    address: `${region} 어딘가`,
    region_label: region,
    lat: 38,
    lng: 128,
    category: '카페',
    kakao_place_id: `k-${id}`,
    added_by: 'u1',
    version: 1,
    ...extra,
  }) as PlaceRow

// 속초 3곳(임계치 충족) + 강릉 1곳(미달)
const PLACES = [
  place('p1', '칠성조선소', '속초'),
  place('p2', '아바이마을', '속초', { category: '관광' }),
  place('p3', '속초해수욕장', '속초', { category: '관광' }),
  place('p4', '안목해변', '강릉'),
]

function renderPlaces() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <PlacesPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('장소 탭', () => {
  beforeEach(() => {
    coupleState = { status: 'ACTIVE', isLoading: false }
    placesState = { data: [], isLoading: false }
    visitsState = { data: [], isLoading: false }
  })

  it('로딩 중엔 스켈레톤 — 빈 상태로 오판해 깜빡이지 않게', () => {
    placesState = { data: [], isLoading: true }
    renderPlaces()
    expect(screen.getByRole('status', { name: '담은 장소 불러오는 중' })).toBeInTheDocument()
    expect(screen.queryByText(/이런 여행은 어때요/)).toBeNull()
  })

  it('담은 장소가 0곳이면 빈 상태 + 첫 액션 + 시드(죽은 탭 금지)', () => {
    renderPlaces()
    expect(screen.getByText('아직 담은 장소가 없어요')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '가고싶은 곳 추가하기' })).toHaveAttribute('href', '/')
    expect(screen.getByText(/이런 여행은 어때요/)).toBeInTheDocument()
  })

  it('미연결이면 연결 안내로 갈아탄다', () => {
    coupleState = { status: 'PENDING', isLoading: false }
    placesState = { data: PLACES, isLoading: false }
    renderPlaces()
    expect(screen.getByText('먼저 상대와 연결해요')).toBeInTheDocument()
  })

  it('지역별로 묶여 렌더된다', () => {
    placesState = { data: PLACES, isLoading: false }
    renderPlaces()
    expect(screen.getByTestId('region-group-속초')).toBeInTheDocument()
    expect(screen.getByTestId('region-group-강릉')).toBeInTheDocument()
    // 그룹 이름에 개수가 함께 들어간다(스크린리더가 규모를 알 수 있게).
    expect(screen.getByRole('region', { name: '속초 3곳' })).toBeInTheDocument()
  })

  it('★ 3곳 이상 모인 지역에만 코스 CTA — 미달이면 몇 곳 더 필요한지 글자로 말한다', () => {
    placesState = { data: PLACES, isLoading: false }
    renderPlaces()
    const sokcho = screen.getByTestId('region-group-속초')
    const gangneung = screen.getByTestId('region-group-강릉')
    expect(within(sokcho).getByRole('button', { name: /코스 짜기/ })).toBeInTheDocument()
    expect(within(gangneung).queryByRole('button', { name: /코스 짜기/ })).toBeNull()
    // 색이나 버튼 유무만으로 말하지 않는다(§8).
    expect(within(gangneung).getByText(/2곳 더 모으면/)).toBeInTheDocument()
  })

  it('★ 담은 장소를 이름으로 찾는다 — 이 탭이 생긴 이유', () => {
    placesState = { data: PLACES, isLoading: false }
    renderPlaces()
    fireEvent.change(screen.getByLabelText('담은 장소 검색'), { target: { value: '안목' } })
    expect(screen.getByTestId('region-group-강릉')).toBeInTheDocument()
    expect(screen.queryByTestId('region-group-속초')).toBeNull()
  })

  it('지역명으로 검색하면 그 지역 장소가 이름과 무관하게 다 나온다', () => {
    placesState = { data: PLACES, isLoading: false }
    renderPlaces()
    fireEvent.change(screen.getByLabelText('담은 장소 검색'), { target: { value: '속초' } })
    // '칠성조선소'는 이름에 '속초'가 없지만 지역이 속초라 나와야 한다.
    expect(screen.getByRole('region', { name: '속초 3곳' })).toBeInTheDocument()
  })

  it('★ 상태 필터와 검색이 곱해진다 — "가본 곳 중에 속초"', () => {
    placesState = { data: PLACES, isLoading: false }
    visitsState = { data: [{ place_id: 'p2' }] as VisitRow[], isLoading: false }
    renderPlaces()
    fireEvent.click(screen.getByRole('button', { name: '가봤음' }))
    fireEvent.change(screen.getByLabelText('담은 장소 검색'), { target: { value: '속초' } })
    // 속초에서 가본 곳은 p2 하나 → 그룹 개수가 1로 줄어든다(3이 아니라).
    expect(screen.getByRole('region', { name: '속초 1곳' })).toBeInTheDocument()
    expect(screen.queryByTestId('region-group-강릉')).toBeNull()
  })

  it('검색 결과가 0이면 "장소 없음"이 아니라 부분 빈 상태를 보여준다', () => {
    placesState = { data: PLACES, isLoading: false }
    renderPlaces()
    fireEvent.change(screen.getByLabelText('담은 장소 검색'), { target: { value: '없는장소' } })
    expect(screen.getByText('조건에 맞는 장소가 없어요')).toBeInTheDocument()
    // 첫 액션 CTA(장소가 아예 없을 때의 화면)로 되돌아가면 안 된다.
    expect(screen.queryByText('아직 담은 장소가 없어요')).toBeNull()
  })

  it('필터 칩은 aria-pressed로도 선택을 말한다(색 단독 구분 금지)', () => {
    placesState = { data: PLACES, isLoading: false }
    renderPlaces()
    expect(screen.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '가고싶음' }))
    expect(screen.getByRole('button', { name: '가고싶음' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'false')
  })
})
