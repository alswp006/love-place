import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { KakaoPlaceHit } from '@/lib/kakao/types'

// 검색 결과 두 건: saved1(이미 저장됨, place p1과 kakao_place_id 일치), new1(미저장).
const hits: KakaoPlaceHit[] = [
  { kakaoPlaceId: 'saved1', name: '저장된 카페', address: '속초', lat: 38, lng: 128, category: '카페', placeUrl: '' },
  { kakaoPlaceId: 'new1', name: '새 식당', address: '강릉', lat: 37.7, lng: 128.9, category: '식당', placeUrl: '' },
]

// savePlace.mutate 스파이 — onSuccess(r)를 제어해 온라인 저장/오프라인 큐를 시뮬레이션.
const saveMutate = vi.fn()

vi.mock('@/state/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/hooks/useCouple', () => ({
  useCouple: () => ({ data: { coupleId: 'c1', status: 'ACTIVE', userA: 'u1', userB: 'u2' } }),
}))
// 가변 places 데이터 — 자동 전환 테스트에서 new1을 저장됨 상태로 흘려보내기 위해 런타임에 교체.
type PlaceRow = { id: string; name: string; kakao_place_id: string; lat: number; lng: number; added_by: string }
let placesData: PlaceRow[] = [
  { id: 'p1', name: '저장된 카페', kakao_place_id: 'saved1', lat: 38, lng: 128, added_by: 'u1' },
]
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
vi.mock('@/hooks/useSavePlace', () => ({ useSavePlace: () => ({ mutate: saveMutate }) }))
// 햅틱은 온라인 저장 성공(r 진실)에만 — 오프라인 큐(r===null)엔 미발화. vibrate 자체를 모킹해 호출 단언(ux §1).
vi.mock('@/lib/haptics', () => ({ haptic: vi.fn() }))
vi.mock('@/lib/naver/loadNaverMaps', () => ({ isNaverMapConfigured: () => true }))
vi.mock('@/hooks/useKakaoSearch', () => ({
  useKakaoSearch: () => ({ query: '카', setQuery: () => {}, clear: () => {}, status: 'done', hits, error: null }),
}))
// PlaceSheet 스텁 — 이제 프리뷰 저장은 시트의 onSave로 흐른다(말풍선 폐지). previewHit 노출 + 저장 버튼.
vi.mock('@/components/places/PlaceSheet', () => ({
  PlaceSheet: (props: { previewHit: { kakaoPlaceId: string } | null; onSave: () => void }) => (
    <div data-testid="sheet">
      <div data-testid="sheet-preview">{props.previewHit?.kakaoPlaceId ?? 'none'}</div>
      <button onClick={props.onSave}>sheet-save</button>
    </div>
  ),
}))
// NaverMap 스텁 — previewHit/selectedId를 노출하고 onSelect만 버튼으로 트리거(상세/액션은 시트).
vi.mock('@/components/map/NaverMap', () => ({
  NaverMap: (props: {
    previewHit: KakaoPlaceHit | null
    selectedId: string | null
    onSelect: (id: string) => void
  }) => (
    <div>
      <div data-testid="preview">{props.previewHit?.kakaoPlaceId ?? 'none'}</div>
      <div data-testid="selected">{props.selectedId ?? 'none'}</div>
    </div>
  ),
}))

import { ToastProvider } from '@/components/common/ToastProvider'
import MapPage from '@/pages/MapPage'
import { haptic } from '@/lib/haptics'

function renderMap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>
          <MapPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MapPage 검색→프리뷰→저장 오케스트레이션(spec §3.6)', () => {
  beforeEach(() => {
    saveMutate.mockReset()
    vi.mocked(haptic).mockClear()
    placesData = [{ id: 'p1', name: '저장된 카페', kakao_place_id: 'saved1', lat: 38, lng: 128, added_by: 'u1' }]
  })

  it('이미 저장된 결과를 탭하면 기존 place를 선택(previewHit 없음, selectedId=p1)', () => {
    renderMap()
    fireEvent.click(screen.getByText('저장된 카페'))
    expect(screen.getByTestId('preview')).toHaveTextContent('none')
    expect(screen.getByTestId('selected')).toHaveTextContent('p1')
  })

  it('미저장 결과를 탭하면 previewHit 설정(selectedId 없음)', () => {
    renderMap()
    fireEvent.click(screen.getByText('새 식당'))
    expect(screen.getByTestId('preview')).toHaveTextContent('new1')
    expect(screen.getByTestId('selected')).toHaveTextContent('none')
  })

  it('미저장 결과를 탭하면 시트에 프리뷰가 전달된다', () => {
    renderMap()
    fireEvent.click(screen.getByText('새 식당'))
    expect(screen.getByTestId('sheet-preview')).toHaveTextContent('new1')
  })

  it('프리뷰 저장 성공(r) 시 savePlace 호출 + previewHit 해제 + 새 place 선택(시트 onSave)', () => {
    // opts? — vitest 정리(cleanup) 단계에서 모듈 스코프 spy가 인자 없이 한 번 더 호출되는 러너 동작 방어.
    // (어설션은 모두 통과; 정리 시점의 무인자 호출이 onSuccess 접근으로 깨지지 않게 가드. 동작/의도 동일.)
    saveMutate.mockImplementation((_hit, opts) => opts?.onSuccess({ placeId: 'p2', jumped: false }))
    renderMap()
    fireEvent.click(screen.getByText('새 식당'))
    fireEvent.click(screen.getByText('sheet-save'))
    expect(saveMutate).toHaveBeenCalledTimes(1)
    expect(saveMutate.mock.calls[0]![0]).toMatchObject({ kakaoPlaceId: 'new1' })
    expect(screen.getByTestId('preview')).toHaveTextContent('none')
    expect(screen.getByTestId('selected')).toHaveTextContent('p2')
    // 온라인 저장 성공(r 진실) → 햅틱 1회(시각 토스트 병행, ux §1).
    expect(haptic).toHaveBeenCalledTimes(1)
  })

  it('오프라인(r===null)이면 선택 없이 큐 토스트를 보여준다(spec §3.6)', () => {
    // opts? — 위와 동일(cleanup 단계 무인자 spy 호출 방어).
    saveMutate.mockImplementation((_hit, opts) => opts?.onSuccess(null))
    renderMap()
    fireEvent.click(screen.getByText('새 식당'))
    fireEvent.click(screen.getByText('sheet-save'))
    expect(screen.getByTestId('selected')).toHaveTextContent('none')
    expect(screen.getByText(/오프라인이라 큐에 담았어요/)).toBeInTheDocument()
    // 오프라인 큐(r===null) → 햅틱 미발화(성공 진실에만).
    expect(haptic).not.toHaveBeenCalled()
  })

  it('새로 저장(jumped=false) 시 "저장했어요" 토스트', () => {
    saveMutate.mockImplementation((_hit, opts) => opts?.onSuccess({ placeId: 'p2', jumped: false }))
    renderMap()
    fireEvent.click(screen.getByText('새 식당'))
    fireEvent.click(screen.getByText('sheet-save'))
    expect(screen.getByText('저장했어요')).toBeInTheDocument()
  })

  it('저장 성공(jumped=true) 시 "이미 담아둔 곳" 토스트', () => {
    saveMutate.mockImplementation((_hit, opts) => opts?.onSuccess({ placeId: 'p9', jumped: true }))
    renderMap()
    fireEvent.click(screen.getByText('새 식당'))
    fireEvent.click(screen.getByText('sheet-save'))
    expect(screen.getByText('이미 담아둔 곳이에요 — 지도에서 보여줄게요')).toBeInTheDocument()
    expect(screen.getByTestId('selected')).toHaveTextContent('p9')
  })

  it('프리뷰 중 상대가 같은 곳을 저장하면 프리뷰→선택 자동 전환', async () => {
    // 같은 트리/클라이언트로 rerender해야 MapPage 상태(previewHit)가 보존된다.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = () => (
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <ToastProvider>
            <MapPage />
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )
    const { rerender } = render(tree())
    fireEvent.click(screen.getByText('새 식당'))
    expect(screen.getByTestId('preview')).toHaveTextContent('new1')
    // 상대가 new1을 저장 → places에 등장(realtime/invalidate 반영을 모킹).
    placesData = [
      ...placesData,
      { id: 'pX', name: '새 식당', kakao_place_id: 'new1', lat: 37.7, lng: 128.9, added_by: 'u2' },
    ]
    rerender(tree())
    await waitFor(() => expect(screen.getByTestId('preview')).toHaveTextContent('none'))
    expect(screen.getByTestId('selected')).toHaveTextContent('pX')
  })
})
