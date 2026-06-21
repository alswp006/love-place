import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter, useSearchParams } from 'react-router-dom'

// 아젠다 장소칩이 /?place=<id>로 내비 → MapPage가 selectedId로 수신 + param clear(R4.3, 발신/수신 닫힘).
// mapPagePreview 테스트와 동일한 mock 스타일(데이터 훅 stub + NaverMap/PlaceSheet 스텁).
type PlaceRow = { id: string; name: string; kakao_place_id: string; lat: number; lng: number; added_by: string }
const placesData: PlaceRow[] = [
  { id: 'p1', name: '저장된 카페', kakao_place_id: 'saved1', lat: 38, lng: 128, added_by: 'u1' },
]

vi.mock('@/state/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/hooks/useCouple', () => ({
  useCouple: () => ({ data: { coupleId: 'c1', status: 'ACTIVE', userA: 'u1', userB: 'u2' } }),
}))
vi.mock('@/hooks/usePlaces', () => ({
  usePlaces: () => ({ data: placesData, isLoading: false }),
}))
vi.mock('@/hooks/useProfiles', () => ({ useProfiles: () => ({ data: {} }) }))
vi.mock('@/hooks/useWishes', () => ({ useWishes: () => ({ data: { byPlace: {}, mine: {} } }) }))
vi.mock('@/hooks/useVisits', () => ({
  useVisits: () => ({ data: [] }),
  useMarkVisited: () => ({ mutate: vi.fn(), isPending: false }),
  useUnmarkVisited: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/useReactions', () => ({
  useReactions: () => ({ data: {} }),
  useToggleReaction: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/hooks/useRealtimePlaces', () => ({ useRealtimePlaces: () => {} }))
vi.mock('@/hooks/useCollections', () => ({
  useCollections: () => ({ data: [] }),
  usePlaceCollections: () => ({ data: [] }),
}))
vi.mock('@/hooks/useRealtimeCollections', () => ({ useRealtimeCollections: () => {} }))
vi.mock('@/hooks/useSavePlace', () => ({ useSavePlace: () => ({ mutate: vi.fn() }) }))
vi.mock('@/lib/haptics', () => ({ haptic: vi.fn() }))
vi.mock('@/lib/naver/loadNaverMaps', () => ({ isNaverMapConfigured: () => true }))
vi.mock('@/hooks/useKakaoSearch', () => ({
  useKakaoSearch: () => ({ query: '', setQuery: () => {}, clear: () => {}, status: 'idle', hits: [], error: null }),
}))
vi.mock('@/components/places/PlaceSheet', () => ({
  PlaceSheet: (props: { selectedId: string | null }) => (
    <div data-testid="sheet-selected">{props.selectedId ?? 'none'}</div>
  ),
}))
vi.mock('@/components/map/NaverMap', () => ({
  NaverMap: (props: { selectedId: string | null }) => (
    <div data-testid="selected">{props.selectedId ?? 'none'}</div>
  ),
}))

import { ToastProvider } from '@/components/common/ToastProvider'
import MapPage from '@/pages/MapPage'

// 현재 URL의 ?place= 를 노출해 param clear를 단언(replace 후 사라져야 함).
function PlaceParamProbe() {
  const [sp] = useSearchParams()
  return <div data-testid="place-param">{sp.get('place') ?? 'none'}</div>
}

function renderMap(entry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <ToastProvider>
          <MapPage />
          <PlaceParamProbe />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MapPage ?place= 딥링크 수신(R4.3 — 아젠다 장소칩→지도 포커스)', () => {
  beforeEach(() => {
    // 각 케이스가 같은 초기 데이터로 시작.
    placesData.splice(0, placesData.length, {
      id: 'p1',
      name: '저장된 카페',
      kakao_place_id: 'saved1',
      lat: 38,
      lng: 128,
      added_by: 'u1',
    })
  })

  it('?place=p1(로드된 장소)이면 selectedId=p1로 시드하고 URL에서 place를 제거한다', async () => {
    renderMap('/?place=p1')
    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('p1'))
    expect(screen.getByTestId('sheet-selected')).toHaveTextContent('p1')
    expect(screen.getByTestId('place-param')).toHaveTextContent('none')
  })

  it('?place=가 미존재(타커플/미로드)면 selection 없음', () => {
    renderMap('/?place=ghost')
    expect(screen.getByTestId('selected')).toHaveTextContent('none')
    expect(screen.getByTestId('sheet-selected')).toHaveTextContent('none')
  })

  it('?place=가 없으면 회귀 없이 selection 없음', () => {
    renderMap('/')
    expect(screen.getByTestId('selected')).toHaveTextContent('none')
  })
})
