import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState, useSyncExternalStore } from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { KakaoPlaceHit } from '@/lib/kakao/types'

// 장소 사용자 여정 통합테스트(해피패스 한 흐름):
//   ?q= 시드 → 후보 onPick → 미저장 프리뷰 상세 → 저장(onSave) → 시트 목록 등장 →
//   상세 진입 → '다녀왔어요' 토글 → 컬렉션 칩 토글.
// 실제 컴포넌트 흐름(MapPage→MapSearchOverlay→PlaceSearch, MapPage→PlaceSheet→PlaceList/PlaceDetail/
// PlacePreviewDetail)을 그대로 태우고, 외부(네이버 SDK/슈퍼베이스)와 데이터·쓰기 훅만 모킹한다.
// 단계 전환(previewHit→selectedId, visitedIds 반영, 컬렉션 멤버십)을 waitFor로 결정론적으로 단언한다.

// ── 외부 가변 스토어 ──────────────────────────────────────────
// 모킹 훅이 읽는 공유 상태. 쓰기(mutate)가 이 상태를 갱신하고 listeners를 깨워(useSyncExternalStore)
// MapPage 트리 전체가 새 데이터로 리렌더 → 실제 invalidate/realtime 전파를 모사한다(rerender(tree) 불필요).
type PlaceRow = {
  id: string
  name: string
  address: string | null
  region_label: string | null
  kakao_place_id: string | null
  lat: number
  lng: number
  category: string | null
  added_by: string
  version: number
}
type VisitRow = { id: string; place_id: string; version: number }
type PlaceColRow = { id: string; collection_id: string; place_id: string; version: number }

const store = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  const s: {
    places: unknown[]
    visits: unknown[]
    placeCollections: unknown[]
    subscribe: (cb: () => void) => () => void
    emit: () => void
  } = {
    places: [],
    visits: [],
    placeCollections: [],
    subscribe: (cb: () => void) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    emit: () => listeners.forEach((l) => l()),
  }
  return s
})

// useSyncExternalStore 구독 헬퍼 — 스토어 슬라이스가 바뀌면 소비 컴포넌트가 리렌더된다.
function useStoreSlice<T>(read: () => T): T {
  return useSyncExternalStore(store.subscribe, read)
}

// ── 데이터 훅 모킹 ────────────────────────────────────────────
vi.mock('@/state/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/hooks/useCouple', () => ({
  useCouple: () => ({ data: { coupleId: 'c1', status: 'ACTIVE', userA: 'u1', userB: 'u2' } }),
}))
vi.mock('@/hooks/usePlaces', () => ({
  usePlaces: () => ({ data: useStoreSlice(() => store.places as PlaceRow[]), isLoading: false }),
}))
vi.mock('@/hooks/useWishes', () => ({ useWishes: () => ({ data: { byPlace: {}, mine: {} } }) }))
vi.mock('@/hooks/useProfiles', () => ({ useProfiles: () => ({ data: {} }) }))
vi.mock('@/hooks/useReactions', () => ({
  useReactions: () => ({ data: {} }),
  useToggleReaction: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/hooks/useRealtimePlaces', () => ({ useRealtimePlaces: () => {} }))
vi.mock('@/hooks/useRealtimeCollections', () => ({ useRealtimeCollections: () => {} }))
vi.mock('@/hooks/useCollections', () => ({
  useCollections: () => ({ data: [{ id: 'col1', name: '데이트코스', version: 1 }] }),
  usePlaceCollections: () => ({
    data: useStoreSlice(() => store.placeCollections as PlaceColRow[]),
  }),
  // 쓰기 훅 — 컬렉션 칩 토글이 placeCollections 스토어를 갱신하게 한다(멤버십 도출 전환 검증).
  useCreateCollection: () => ({ mutate: vi.fn(), isPending: false }),
  useRenameCollection: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteCollection: () => ({ mutate: vi.fn(), isPending: false }),
  useAddPlaceToCollection: () => ({
    mutate: (v: { placeId: string; collectionId: string }) => {
      store.placeCollections = [
        ...(store.placeCollections as PlaceColRow[]),
        { id: `pc-${v.placeId}-${v.collectionId}`, collection_id: v.collectionId, place_id: v.placeId, version: 1 },
      ]
      store.emit()
    },
    isPending: false,
  }),
  useRemovePlaceFromCollection: () => ({
    mutate: (v: { placeId: string; collectionId: string }) => {
      store.placeCollections = (store.placeCollections as PlaceColRow[]).filter(
        (pc) => !(pc.place_id === v.placeId && pc.collection_id === v.collectionId),
      )
      store.emit()
    },
    isPending: false,
  }),
}))
vi.mock('@/hooks/useVisits', () => ({
  useVisits: () => ({ data: useStoreSlice(() => store.visits as VisitRow[]) }),
  // '다녀왔어요' → visits 스토어에 행 추가(가봤음=visits 존재 도출). 토스트 onSuccess 전달.
  useMarkVisited: () => ({
    mutate: (
      v: { placeId: string; alreadyVisited?: boolean },
      opts?: { onSuccess?: () => void },
    ) => {
      if (!v.alreadyVisited) {
        store.visits = [
          ...(store.visits as VisitRow[]),
          { id: `v-${v.placeId}`, place_id: v.placeId, version: 1 },
        ]
        store.emit()
      }
      opts?.onSuccess?.()
    },
    isPending: false,
  }),
  useUnmarkVisited: () => ({
    mutate: (v: { placeId: string }, opts?: { onSuccess?: (r: { status: string }) => void }) => {
      const had = (store.visits as VisitRow[]).some((x) => x.place_id === v.placeId)
      store.visits = (store.visits as VisitRow[]).filter((x) => x.place_id !== v.placeId)
      store.emit()
      opts?.onSuccess?.({ status: had ? 'removed' : 'noop' })
    },
    isPending: false,
  }),
}))
// 저장 — savePlace.mutate가 새 place를 스토어에 추가하고 onSuccess(placeId)로 선택 전환을 유발.
vi.mock('@/hooks/useSavePlace', () => ({
  useSavePlace: () => ({
    mutate: (hit: KakaoPlaceHit, opts?: { onSuccess?: (r: { placeId: string; jumped: boolean }) => void }) => {
      const id = `p-${hit.kakaoPlaceId}`
      store.places = [
        ...(store.places as PlaceRow[]),
        {
          id,
          name: hit.name,
          address: hit.address,
          region_label: hit.address,
          kakao_place_id: hit.kakaoPlaceId,
          lat: hit.lat,
          lng: hit.lng,
          category: hit.category,
          added_by: 'u1',
          version: 1,
        },
      ]
      store.emit()
      opts?.onSuccess?.({ placeId: id, jumped: false })
    },
  }),
}))
vi.mock('@/lib/haptics', () => ({ haptic: vi.fn() }))
vi.mock('@/lib/naver/loadNaverMaps', () => ({ isNaverMapConfigured: () => true }))

// useKakaoSearch 모킹 — setQuery(검색어/시드)가 호출되면 후보를 드러내고 status=done으로 전환.
// 실제 PlaceSearch가 hits를 렌더 → onPick까지 실제 흐름을 태운다.
const HITS: KakaoPlaceHit[] = [
  { kakaoPlaceId: 'new1', name: '속초 칠성조선소', address: '강원 속초시', lat: 38.2, lng: 128.59, category: '카페', placeUrl: '' },
]
vi.mock('@/hooks/useKakaoSearch', () => ({
  useKakaoSearch: () => {
    const [query, setQ] = useState('')
    return {
      query,
      setQuery: (q: string) => setQ(q),
      clear: () => setQ(''),
      // 검색어가 있으면 후보 노출(디바운스/네트워크는 생략 — 흐름 검증 목적).
      status: query.trim() ? 'done' : 'idle',
      hits: query.trim() ? HITS : [],
      error: null,
    }
  },
}))

// NaverMap만 스텁(네이버 SDK 의존). previewHit/selectedId를 노출해 단계 전환을 추가로 단언.
vi.mock('@/components/map/NaverMap', () => ({
  NaverMap: (props: { previewHit: KakaoPlaceHit | null; selectedId: string | null }) => (
    <div>
      <div data-testid="map-preview">{props.previewHit?.kakaoPlaceId ?? 'none'}</div>
      <div data-testid="map-selected">{props.selectedId ?? 'none'}</div>
    </div>
  ),
}))

import { OfflineQueueProvider } from '@/state/OfflineQueueProvider'
import { ToastProvider } from '@/components/common/ToastProvider'
import MapPage from '@/pages/MapPage'

function renderJourney() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/?q=속초 칠성조선소']}>
        <OfflineQueueProvider>
          <ToastProvider>
            <MapPage />
          </ToastProvider>
        </OfflineQueueProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('장소 사용자 여정(검색 시드→저장→상세→다녀왔어요→컬렉션) 통합', () => {
  // 기존 장소 1개로 시작 — places.length>0이면 auto-half(빈 화면 자동 펼침)가 발화하지 않아
  // 시트가 peek 유지 → 상단 검색 오버레이가 collapse(aria-hidden)되지 않는다(시드 후보가 보임).
  const SEED: PlaceRow = {
    id: 'p0',
    name: '기존 장소',
    address: '서울',
    region_label: '서울',
    kakao_place_id: 'seed0',
    lat: 37.5,
    lng: 127,
    category: '카페',
    added_by: 'u1',
    version: 1,
  }
  beforeEach(() => {
    store.places = [SEED]
    store.visits = []
    store.placeCollections = []
  })

  it('?q= 시드 → onPick → 프리뷰 → 저장 → 목록 → 상세 → 다녀왔어요 → 컬렉션 칩까지 한 흐름으로 동작한다', async () => {
    renderJourney()

    // 1) ?q= 시드: 검색 오버레이가 initialQuery로 자동완성을 띄운다(후보 등장).
    const candidate = await screen.findByRole('button', { name: '속초 칠성조선소 미리보기' })
    expect(candidate).toBeInTheDocument()

    // 2) 후보 onPick: 미저장이므로 프리뷰 상세로 전환(selectedId 없음, previewHit=new1).
    fireEvent.click(candidate)
    const preview = await screen.findByLabelText('검색 결과 미리보기')
    expect(within(preview).getByText('속초 칠성조선소')).toBeInTheDocument()
    expect(screen.getByTestId('map-preview')).toHaveTextContent('new1')
    expect(screen.getByTestId('map-selected')).toHaveTextContent('none')
    // 미저장 프리뷰 모드에서는 목록을 숨긴다.
    expect(screen.queryByRole('region', { name: '장소 목록' })).toBeNull()

    // 3) 저장(onSave): savePlace가 새 place를 스토어에 추가 → 프리뷰 해제 + 새 place 선택(상세).
    fireEvent.click(within(preview).getByRole('button', { name: '속초 칠성조선소 저장' }))
    // previewHit→selectedId 전환을 결정론적으로 단언(저장 성공 r.placeId 선택).
    await waitFor(() => expect(screen.getByTestId('map-selected')).toHaveTextContent('p-new1'))
    expect(screen.getByTestId('map-preview')).toHaveTextContent('none')

    // 4) 저장 직후 상세(PlaceDetail)가 새 place로 뜬다(목록은 상세 모드라 숨김).
    const detail = await screen.findByLabelText('장소 상세')
    expect(within(detail).getByText('속초 칠성조선소')).toBeInTheDocument()
    // 미방문 상태 → '다녀왔어요' 버튼 노출, '가봤음 (취소)' 아님.
    const visitBtn = within(detail).getByRole('button', { name: '속초 칠성조선소 다녀왔어요' })
    expect(visitBtn).toBeInTheDocument()

    // 5) '다녀왔어요' 토글: visits 스토어에 행 추가 → visitedIds 반영 → 상세가 '가봤음 (취소)'로 전환.
    fireEvent.click(visitBtn)
    await waitFor(() =>
      expect(
        within(screen.getByLabelText('장소 상세')).getByRole('button', {
          name: '속초 칠성조선소 가봤음 기록 취소',
        }),
      ).toBeInTheDocument(),
    )
    // 가봤음 기록 토스트(실제 onSuccess 경로).
    expect(screen.getByText(/가봤어요로 기록했어요/)).toBeInTheDocument()

    // 6) 컬렉션 칩 토글(상세의 "목록" 섹션): 담기 전 aria-pressed=false → 담은 뒤 true(멤버십 도출 전환).
    const collChip = within(screen.getByLabelText('장소 상세')).getByRole('button', {
      name: '데이트코스 목록에 담기',
    })
    expect(collChip).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(collChip)
    await waitFor(() =>
      expect(
        within(screen.getByLabelText('장소 상세')).getByRole('button', {
          name: '데이트코스 목록에서 빼기',
        }),
      ).toHaveAttribute('aria-pressed', 'true'),
    )
  })

  it('상세를 닫으면 목록으로 복귀하고 저장한 장소가 목록 카드로 보인다(상세→목록 왕복)', async () => {
    renderJourney()

    // 검색→프리뷰→저장(앞 흐름 압축).
    fireEvent.click(await screen.findByRole('button', { name: '속초 칠성조선소 미리보기' }))
    fireEvent.click(
      within(await screen.findByLabelText('검색 결과 미리보기')).getByRole('button', {
        name: '속초 칠성조선소 저장',
      }),
    )
    await screen.findByLabelText('장소 상세')

    // 상세 닫기(✕ → onCloseDetail이 selectedId 비움) → 목록 복귀 + 저장한 장소가 카드로 등장.
    fireEvent.click(within(screen.getByLabelText('장소 상세')).getByRole('button', { name: '닫기' }))
    const list = await screen.findByRole('region', { name: '장소 목록' })
    expect(within(list).getByRole('button', { name: '속초 칠성조선소 지도에서 보기' })).toBeInTheDocument()
    expect(screen.queryByLabelText('장소 상세')).toBeNull()
  })
})
