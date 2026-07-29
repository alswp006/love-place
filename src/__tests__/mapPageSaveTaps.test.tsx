import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { KakaoPlaceHit } from '@/lib/kakao/types'

// 위시 저장 ≤3탭 회귀 가드(§8 / ux-and-accessibility.md §3).
//
// mapPagePreview.test.tsx는 PlaceSheet를 통째로 스텁으로 갈아끼워 오케스트레이션만 본다 —
// 그래서 "시트를 손으로 펼쳐야 저장 버튼이 보인다"는 마찰이 그 테스트에는 잡히지 않았다.
// 여기서는 **PlaceSheet를 모킹하지 않고** 실제로 렌더해 클릭 수를 센다.
//
// 주의(표현): e2e 시드는 메서드 무관 정적 JSON이고 여기선 저장 mutate가 스파이라,
// 이 게이트가 세는 것은 "저장 **요청**까지의 탭 수"이지 서버 성공이 아니다.

const hits: KakaoPlaceHit[] = [
  { kakaoPlaceId: 'new1', name: '새 식당', address: '강릉', lat: 37.7, lng: 128.9, category: '식당', placeUrl: '' },
]

const saveMutate = vi.fn()

vi.mock('@/state/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/hooks/useCouple', () => ({
  useCouple: () => ({ data: { coupleId: 'c1', status: 'ACTIVE', userA: 'u1', userB: 'u2' } }),
}))
// 장소 0곳 = 콜드스타트(가장 흔한 첫 저장 상황). 이때 시트가 auto-half로 열린다.
vi.mock('@/hooks/usePlaces', () => ({ usePlaces: () => ({ data: [], isLoading: false }) }))
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
// 컬렉션은 이 흐름과 무관 — 실제 모듈을 펼치고 조회만 빈 배열로 덮는다(export 목록을 손으로 좇지 않게).
vi.mock('@/hooks/useCollections', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useCollections')>()),
  useCollections: () => ({ data: [] }),
  usePlaceCollections: () => ({ data: [] }),
}))
vi.mock('@/hooks/useRealtimeCollections', () => ({ useRealtimeCollections: () => {} }))
vi.mock('@/hooks/useSavePlace', () => ({ useSavePlace: () => ({ mutate: saveMutate }) }))
vi.mock('@/hooks/useEvents', () => ({ useEvents: () => ({ data: [] }) }))
vi.mock('@/lib/haptics', () => ({ haptic: vi.fn() }))
// 검색 오버레이는 지도가 설정됐을 때만 렌더되므로 true. 지도 SDK 자체는 로더가 모킹돼 뜨지 않는다.
vi.mock('@/lib/naver/loadNaverMaps', () => ({
  isNaverMapConfigured: () => true,
  loadNaverMaps: () => new Promise(() => {}),
}))
vi.mock('@/hooks/useKakaoSearch', () => ({
  useKakaoSearch: () => ({ query: '식', setQuery: () => {}, clear: () => {}, status: 'done', hits, error: null }),
}))

import MapPage from '@/pages/MapPage'
import { ToastProvider } from '@/components/common/ToastProvider'
import { OfflineQueueProvider } from '@/state/OfflineQueueProvider'

// 실제 화면과 같은 provider 스택으로 감싼다 — PlaceSheet를 스텁으로 갈아끼우지 않는 게 이 테스트의 요점이라
// 그 안이 쓰는 컨텍스트도 진짜로 있어야 한다.
function renderMap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <OfflineQueueProvider>
        <ToastProvider>
          <MemoryRouter>
            <MapPage />
          </MemoryRouter>
        </ToastProvider>
      </OfflineQueueProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  saveMutate.mockReset()
})

describe('위시 저장 탭 수 (§8 ≤3탭)', () => {
  it('검색 결과 탭 → 저장까지 클릭 3회 이하 (시트를 손으로 펼치지 않고)', () => {
    renderMap()

    let taps = 0
    // 1탭: 검색 결과 고르기. (검색어 입력은 §8 계산에서 '탭'이 아니라 입력으로 본다.)
    fireEvent.click(screen.getByText('새 식당'))
    taps += 1

    // 여기서 시트가 자동으로 half로 승격돼야 한다 — 예전엔 미저장 previewHit이 승격 대상이
    // 아니라서 '시트 펼치기'를 한 번 더 눌러야 저장 버튼이 보였다(그게 4탭의 정체).
    const saveBtn = screen.getByRole('button', { name: /저장/ })
    expect(saveBtn).toBeInTheDocument()

    // 2탭: 저장.
    fireEvent.click(saveBtn)
    taps += 1

    expect(saveMutate).toHaveBeenCalled()
    expect(taps).toBeLessThanOrEqual(3)
  })

  it('상세가 열려도(half) 검색창이 살아 있어 다음 장소를 이어서 찾을 수 있다', () => {
    renderMap()
    fireEvent.click(screen.getByText('새 식당'))
    // half로 승격된 뒤에도 검색 오버레이가 접히지 않는다(collapsed는 full에서만).
    expect(screen.getByTestId('search-overlay')).not.toHaveAttribute('data-hidden', 'true')
  })
})
