import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, createEvent, within, waitFor } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { SnapStop } from '@/lib/places/sheetSnap'

// PlaceSheet는 데이터 훅(useWishes/useVisits 등)을 직접 호출하지 않고 props로 받는 표현형 컴포넌트.
// 검색(PlaceSearch)은 시트가 아니라 지도 위 상단 오버레이(MapPage)로 옮겨졌으므로 여기서 mock하지 않는다.

// 가봤음 취소(useUnmarkVisited)는 mutationFn에서 살아있는 방문행을 supabase로 재조회한 뒤 softDelete한다.
// 상태별 토스트(removed/noop/conflict)를 검증하려고 그 두 의존만 모킹해 status를 제어한다.
// (PlaceSheet는 props로 데이터를 받으므로 다른 테스트의 렌더에는 영향이 없다 — 마운트 시 supabase 쿼리 없음.)
const h = vi.hoisted(() => {
  const state: { selectResult: { data: unknown[] | null; error: { message: string } | null } } = {
    selectResult: { data: [], error: null },
  }
  const softDelete = vi.fn(async () => ({ status: 'ok' }) as { status: 'ok' | 'conflict' })
  const q: Record<string, unknown> = {}
  q.select = vi.fn(() => q)
  q.eq = vi.fn(() => q)
  q.is = vi.fn(() => Promise.resolve(state.selectResult))
  // markVisited(다녀왔어요)는 supabase.from('visits').insert({...})로 방문행을 추가한다(온라인 경로) →
  // onSuccess가 발화하도록 insert를 성공(error:null)으로 스텁. (이 테스트엔 indexedDB가 없어 onLine=true 전제.)
  q.insert = vi.fn(() => Promise.resolve({ error: null }))
  return { state, softDelete, q }
})
vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: vi.fn(() => h.q), channel: vi.fn(() => ({ on: () => ({ subscribe: () => ({}) }) })), removeChannel: vi.fn() },
  isSupabaseConfigured: true,
}))
vi.mock('@/lib/sync/versionedUpdate', async (orig) => {
  const real = await orig<typeof import('@/lib/sync/versionedUpdate')>()
  return { ...real, softDelete: h.softDelete }
})
// 햅틱은 성공/제거(removed)에만, 충돌/무동작(noop)엔 미발화 — vibrate 자체를 모킹해 호출 단언(ux §1).
vi.mock('@/lib/haptics', () => ({ haptic: vi.fn() }))

import { OfflineQueueProvider } from '@/state/OfflineQueueProvider'
import { ToastProvider } from '@/components/common/ToastProvider'
import { PlaceSheet } from '@/components/places/PlaceSheet'
import { haptic } from '@/lib/haptics'

// PlaceSheet가 보유하는 쓰기 훅(useSetWishPriority/useDeletePlace/useRestorePlace)은 내부에서
// useOfflineQueue()를 호출 → <OfflineQueueProvider> 조상이 없으면 throw. 따라서 시트를 마운트하는
// 모든 테스트는 OfflineQueueProvider로 감싼다. (jsdom에는 indexedDB가 없어 outboxStore가 자동으로
// 메모리 스토어로 폴백하고 navigator.onLine도 정의돼 있으므로 추가 mock은 불필요.)
// 비어있지 않은 장소 1개 — auto-half(T14: 빈/미연결/로딩 시 half 자동 오픈)를 발화시키지 않고
// peek 기본값을 유지해야 하는 테스트용 픽스처. (places.length>0 이면 'nothingToShow'가 false.)
const aPlace = {
  id: 'p1',
  name: '칠성조선소',
  address: '속초',
  region_label: '속초',
  lat: 38,
  lng: 128,
  category: '카페',
  kakao_place_id: 'k1',
  added_by: 'u1',
  version: 1,
  wish: { wishedByMe: true, wishedByPartner: false, bothWished: false, wishCount: 1, totalPriority: 0, maxPriority: 0 },
} as Parameters<typeof PlaceSheet>[0]['places'][number]

// renderSheet: wrap PlaceSheet so snap stays interactive in tests(controlled snap → MapPage가 정본).
function Harness(props: Omit<Parameters<typeof PlaceSheet>[0], 'snap' | 'onSnapChange'>) {
  const [snap, setSnap] = useState<SnapStop>('peek')
  return <PlaceSheet {...props} snap={snap} onSnapChange={setSnap} />
}

function sheetProps(
  over: Partial<Parameters<typeof PlaceSheet>[0]> = {},
): Omit<Parameters<typeof PlaceSheet>[0], 'snap' | 'onSnapChange'> {
  return {
    coupleId: 'c1',
    myId: 'u1',
    coupleActive: true,
    places: [],
    visitedIds: new Set<string>(),
    placesLoading: false,
    selectedId: null,
    previewHit: null,
    reactions: {},
    onSave: () => {},
    onCloseDetail: () => {},
    ...over,
  }
}

function renderSheet(over: Partial<Parameters<typeof PlaceSheet>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // 트리 팩토리로 두면 rerenderWith가 같은 QueryClient/Harness 인스턴스를 유지한다
  // (재마운트되면 Harness의 snap state가 초기화돼 '선택 등장 시 승격'을 검증할 수 없다).
  const tree = (p: Omit<Parameters<typeof PlaceSheet>[0], 'snap' | 'onSnapChange'>) => (
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <OfflineQueueProvider>
          <ToastProvider>
            <Harness {...p} />
          </ToastProvider>
        </OfflineQueueProvider>
      </QueryClientProvider>
    </MemoryRouter>
  )
  const result = render(tree(sheetProps(over)))
  return {
    ...result,
    /** props만 갈아끼워 다시 렌더(마운트 유지) — 선택이 '새로 생기는' 전이를 재현할 때 쓴다. */
    rerenderWith: (next: Partial<Parameters<typeof PlaceSheet>[0]>) =>
      result.rerender(tree(sheetProps({ ...over, ...next }))),
  }
}

describe('PlaceSheet (드래그 시트)', () => {
  it('시트는 항상 보이는 패널이므로 role=region + aria-label(modal 아님, spec §3.7)', () => {
    renderSheet()
    expect(screen.getByRole('region', { name: '장소 시트' })).toBeInTheDocument()
  })

  it('핸들 버튼에 aria-expanded(peek=false)가 있다', () => {
    // 장소가 있으면 auto-half(T14)가 발화하지 않아 기본 peek 유지 → aria-expanded=false.
    renderSheet({ places: [aPlace] })
    const btn = screen.getByRole('button', { name: /시트 펼치기|시트 단계 전환/ })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
  })

  it('핸들에 탭 대체 버튼(스냅 전환)을 제공한다(제스처 발견성 보완)', () => {
    renderSheet()
    expect(screen.getByRole('button', { name: /시트 펼치기|시트 단계 전환/ })).toBeInTheDocument()
  })

  it('탭 대체 버튼 클릭 시 시트 단계가 올라간다(aria-label 변화)', () => {
    // 장소가 있으면 auto-half(T14) 미발화 → peek에서 시작(백드롭 없음 → 핸들만 /시트/ 매칭).
    renderSheet({ places: [aPlace] })
    const btn = screen.getByRole('button', { name: /시트 펼치기|시트 단계 전환/ })
    fireEvent.click(btn)
    // peek→half로 올라가면 다음 라벨은 여전히 펼치기(half→full)거나 dialog가 확장됨.
    expect(screen.getByRole('region', { name: '장소 시트' })).toBeInTheDocument()
  })

  it('★ 필터 칩은 시트에 없다 — 목록과 함께 장소 탭으로 옮겼다(2026-08)', () => {
    // 시트가 검색·목록·관리를 한꺼번에 지면서 스냅 상태가 꼬여 지도가 잠기는 버그가 났고,
    // 드래그 시트 안에서 수백 곳을 거른다는 것 자체가 성립하지 않았다.
    // 거를 목록이 없으니 칩도 여기 있을 이유가 없다.
    renderSheet({ places: [aPlace] })
    expect(screen.queryByRole('group', { name: '장소 필터' })).toBeNull()
    expect(screen.queryByRole('button', { name: '전체' })).toBeNull()
  })

  it('★ 아무것도 안 골랐을 땐 목록으로 가는 길을 준다(죽은 시트 금지)', () => {
    renderSheet({ places: [aPlace] })
    expect(screen.getByRole('link', { name: '장소 목록 열기' })).toHaveAttribute('href', '/places')
  })

  it('peek에서 selectedId가 생기면 half로 살짝 올린다(§6 (c))', () => {
    // 같은 provider 트리에서 selectedId만 바꿔 effect가 발화하도록(리마운트 시 내부 snap이 초기화됨).
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const SelHarness = ({ selectedId }: { selectedId: string | null }) => {
      const [snap, setSnap] = useState<SnapStop>('peek')
      return (
        // 시트의 '장소 목록 열기'가 <Link>라 라우터 컨텍스트가 필요하다.
        <MemoryRouter>
        <QueryClientProvider client={qc}>
          <OfflineQueueProvider>
            <ToastProvider>
              <PlaceSheet
                coupleId="c1"
                myId="u1"
                coupleActive
                // 장소가 있어야 auto-half(T14)가 발화하지 않아 selectedId→half 효과를 단독 검증할 수 있다.
                places={[aPlace]}
                visitedIds={new Set<string>()}
                placesLoading={false}
                selectedId={selectedId}
                previewHit={null}
                reactions={{}}
                onSave={() => {}}
                onCloseDetail={() => {}}
                snap={snap}
                onSnapChange={setSnap}
              />
            </ToastProvider>
          </OfflineQueueProvider>
        </QueryClientProvider>
        </MemoryRouter>
      )
    }
    const { rerender } = render(<SelHarness selectedId={null} />)
    const sheet = screen.getByRole('region', { name: '장소 시트' })
    const peekY = sheet.style.transform
    // 선택 발생(마커 클릭 등) → peek면 half로 상향(같은 인스턴스, prop만 변경).
    rerender(<SelHarness selectedId="p1" />)
    expect(sheet.style.transform).not.toBe(peekY)
  })

  it('selectedId가 있으면 시트 상단에 PlaceDetail(상세)을 표시한다', () => {
    const place = { id: 'p1', name: '칠성조선소', address: '속초', region_label: '속초', lat: 38, lng: 128, category: '카페', kakao_place_id: 'k1', added_by: 'u1', version: 1, wish: { wishedByMe: true, wishedByPartner: false, bothWished: false, wishCount: 1, totalPriority: 0, maxPriority: 0 } }
    renderSheet({ places: [place], selectedId: 'p1' })
    const detail = screen.getByLabelText('장소 상세')
    expect(detail).toBeInTheDocument()
    // 상세 모드에서는 목록이 숨겨지므로 이름은 상세 영역 안에만 나타난다.
    expect(within(detail).getByText('칠성조선소')).toBeInTheDocument()
  })

  // T18: 마커/카드 탭 → 상세 모드(PlaceDetail 주요, 목록 숨김). 닫으면 목록 복귀, 칩도 복귀.
  it('상세 모드(selectedId)에서는 PlaceDetail만 보이고 PlaceList(목록)는 렌더하지 않는다', () => {
    renderSheet({ places: [aPlace], selectedId: 'p1' })
    expect(screen.getByLabelText('장소 상세')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '장소 목록' })).toBeNull()
  })

  it('상세를 닫으면 상세가 사라지고 목록으로 가는 안내가 돌아온다', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const CloseHarness = ({ selectedId }: { selectedId: string | null }) => {
      const [snap, setSnap] = useState<SnapStop>('peek')
      return (
        <PlaceSheet
          coupleId="c1"
          myId="u1"
          coupleActive
          places={[aPlace]}
          visitedIds={new Set<string>()}
          placesLoading={false}
          selectedId={selectedId}
          previewHit={null}
          reactions={{}}
          onSave={() => {}}
          onCloseDetail={() => {}}
          snap={snap}
          onSnapChange={setSnap}
        />
      )
    }
    const { rerender } = render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <OfflineQueueProvider>
            <ToastProvider>
              <CloseHarness selectedId="p1" />
            </ToastProvider>
          </OfflineQueueProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    // 상세 모드: 목록 없음.
    expect(screen.getByLabelText('장소 상세')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '장소 목록' })).toBeNull()
    // 닫기(onCloseDetail이 MapPage에서 selectedId를 비움) → 상세 사라짐, 목록 안내 복귀.
    rerender(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <OfflineQueueProvider>
            <ToastProvider>
              <CloseHarness selectedId={null} />
            </ToastProvider>
          </OfflineQueueProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByLabelText('장소 상세')).toBeNull()
    // 목록 자체는 더는 시트에 없다 — 대신 목록으로 가는 길이 돌아온다.
    expect(screen.getByRole('link', { name: '장소 목록 열기' })).toBeInTheDocument()
  })

  it('미리보기(previewHit) 모드에서도 목록은 숨기고 미리보기 상세만 보인다', () => {
    const hit = { kakaoPlaceId: 'k9', name: '미리보기카페', address: '서울', lat: 37, lng: 127, category: '카페', placeUrl: 'https://place/k9' } as Parameters<typeof PlaceSheet>[0]['previewHit']
    renderSheet({ places: [aPlace], previewHit: hit })
    expect(screen.getByLabelText('검색 결과 미리보기')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '장소 목록' })).toBeNull()
  })

  it('커플 미연결이면 연결 안내 빈 상태를 보여준다', () => {
    renderSheet({ coupleActive: false })
    expect(screen.getByText('먼저 상대와 연결해요')).toBeInTheDocument()
  })

  it('미연결 빈 상태에 /us로 가는 액션 버튼이 있다', () => {
    // PlaceSheet의 미연결 EmptyState는 Router 컨텍스트가 필요 → MemoryRouter로 감싸 렌더.
    renderSheet({ coupleActive: false })
    expect(screen.getByRole('link', { name: /우리 탭에서 연결/ })).toHaveAttribute('href', '/us')
  })

  it('시트는 검색·목록·여행·휴지통 어느 것도 호스팅하지 않는다 — 지도는 공간을 보는 곳이다', () => {
    // 검색 → 지도 위 상단 오버레이 / 목록·필터·컬렉션 → 장소 탭 / 휴지통 → 우리 탭.
    // 시트에 남는 것은 '고른 장소의 상세' 하나뿐이다.
    renderSheet({ places: [aPlace] })
    expect(screen.queryByTestId('place-search')).not.toBeInTheDocument()
    expect(screen.queryByTestId('trips-section')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /휴지통/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '장소 필터' })).toBeNull()
  })

  it('뷰포트 높이 변화(resize)에 시트 위치(translateY)를 갱신한다(iOS 주소창/회전 대응)', () => {
    const orig = window.innerHeight
    renderSheet()
    const sheet = screen.getByRole('region', { name: '장소 시트' })
    const before = sheet.style.transform // peek: translateY = vh*(1-0.18)
    // iOS 주소창 노출 등으로 innerHeight 축소 → resize 발화 → vh state 갱신 → translateY 재계산.
    Object.defineProperty(window, 'innerHeight', { value: orig - 300, configurable: true, writable: true })
    fireEvent(window, new Event('resize'))
    expect(sheet.style.transform).not.toBe(before)
    Object.defineProperty(window, 'innerHeight', { value: orig, configurable: true, writable: true })
  })

  it('백드롭은 항상 마운트되고 peek=투명/비활성, half/full=불투명/활성, 탭하면 peek로 접힌다', () => {
    // 백드롭은 이제 조건부 마운트가 아니라 항상 렌더(드래그 진행형 딤, T13). peek에서는 opacity=0 +
    // pointerEvents=none으로 사실상 비활성. 장소가 있으면 auto-half(T14) 미발화 → peek에서 시작.
    renderSheet({ places: [aPlace] })
    const backdrop = screen.getByRole('button', { name: '시트 접기' })
    // peek: progress=0 → 딤 투명·클릭 비활성.
    expect(backdrop.style.opacity).toBe('0')
    expect(backdrop.style.pointerEvents).toBe('none')
    const handle = screen.getByRole('button', { name: /시트 펼치기|시트 단계 전환/ })
    fireEvent.click(handle) // peek→half
    // half: progress>0 → 딤 보임·클릭 활성.
    expect(Number(backdrop.style.opacity)).toBeGreaterThan(0)
    expect(backdrop.style.pointerEvents).toBe('auto')
    fireEvent.click(backdrop) // 탭 → peek로 접힘.
    expect(backdrop.style.opacity).toBe('0')
    expect(backdrop.style.pointerEvents).toBe('none')
  })

  // ── 상세가 열린 상태의 접기 (회귀) ────────────────────────────────────────────
  // 위 백드롭 테스트는 selectedId=null로만 돌아서 이 조합을 못 잡았다. 실제 사용자는 거의 항상
  // '마커를 탭해서 상세를 연' 상태이고, 바로 그 상태에서 시트가 peek로 못 내려갔다.
  it('상세가 열려 있어도 백드롭 탭으로 peek까지 접힌다 — 되올라오면 지도가 영구히 막힌다(회귀)', () => {
    // 회귀 내용: auto-half effect의 deps에 snap이 있어, 선택이 살아 있는 동안 snap이 peek가 될
    // 때마다 다시 발화했다. 시트가 peek에 1프레임도 못 머물러 딤이 걷히지 않고, pointer-events:auto인
    // 전체화면 백드롭이 지도 탭·핀 탭을 전부 삼켰다(지도 빈 곳 탭 → 선택 해제 경로까지 가려짐).
    // 탈출구가 시트 안 ✕ 하나뿐인 상태 = 사용자가 본 "어두워지고 아무것도 안 됨".
    renderSheet({ places: [aPlace], selectedId: 'p1' })
    const backdrop = screen.getByRole('button', { name: '시트 접기' })
    // 선택이 있으니 마운트 시 half로 승격되는 건 의도된 동작(§6 (c)) — 딤이 보인다.
    expect(Number(backdrop.style.opacity)).toBeGreaterThan(0)
    expect(backdrop.style.pointerEvents).toBe('auto')

    fireEvent.click(backdrop)

    // ★ 여기서 half로 되돌아오면 실패. 선택은 그대로여도 접기는 존중돼야 한다.
    expect(backdrop.style.opacity).toBe('0')
    expect(backdrop.style.pointerEvents).toBe('none')
  })

  it('선택이 새로 생기면 여전히 peek→half로 올라온다(위시 저장 ≤3탭 보존)', () => {
    // 되올림을 없앤 게 아니라 '1회성'으로 바꾼 것뿐이다. 승격 자체가 죽으면 §8의 ≤3탭이 깨진다.
    const { rerenderWith } = renderSheet({ places: [aPlace], selectedId: null })
    const backdrop = screen.getByRole('button', { name: '시트 접기' })
    expect(backdrop.style.opacity).toBe('0') // 선택 없음 → peek

    rerenderWith({ selectedId: 'p1' })

    expect(Number(backdrop.style.opacity)).toBeGreaterThan(0) // 선택 발생 → half로 승격
  })

  it('빈 상태(0곳·연결됨)면 마운트 시 시트가 half로 자동 오픈', () => {
    renderSheet({ places: [], coupleActive: true, placesLoading: false })
    // half면 핸들 aria-expanded=true. (auto-half 후 백드롭 '시트 접기'도 /시트/에 걸리므로
    // 핸들만 매칭하는 구체 라벨로 한정 — 현 트리에 백드롭 버튼이 존재함, 플랜의 /시트/ 광역 셀렉터 adapt.)
    expect(screen.getByRole('button', { name: /시트 펼치기|시트 단계 전환/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('로딩 중 peek 요약은 "불러오는 중…"(‘0곳’ 금지)', () => {
    renderSheet({ places: [], placesLoading: true })
    expect(screen.getByText(/불러오는 중…/)).toBeInTheDocument()
    expect(screen.queryByText('우리 장소 0곳')).toBeNull()
  })
})

// jsdom에는 네이티브 PointerEvent가 없어 fireEvent.pointer*가 clientY를 실어주지 않는다 →
// createEvent로 만든 뒤 clientY를 명시적으로 정의해 핸들러가 실제 좌표를 읽게 한다(드래그 임계 검증).
type PtrKind = 'pointerDown' | 'pointerMove' | 'pointerUp'
function firePointer(el: Element, kind: PtrKind, clientY: number) {
  const ev = createEvent[kind](el, { pointerId: 1 })
  Object.defineProperty(ev, 'clientY', { value: clientY, configurable: true })
  fireEvent(el, ev)
}

describe('PlaceSheet — peekHeader 전체 드래그 + 6px 임계 + 당겨 접기(R1.4, T10)', () => {
  // onSnapChange 호출 횟수/인자를 정밀 검증하려고 controlled snap을 spy로 감싼다.
  // (Harness 대신 직접 spy를 넘겨 드래그-정착 vs 탭-cycle vs 합성 click 가드를 구분.)
  function renderWithSpy(snap: SnapStop = 'peek') {
    const onSnapChange = vi.fn()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <OfflineQueueProvider>
            <ToastProvider>
              <PlaceSheet
                coupleId="c1"
                myId="u1"
                coupleActive
                places={[aPlace]}
                visitedIds={new Set<string>()}
                placesLoading={false}
                selectedId={null}
                previewHit={null}
                reactions={{}}
                onSave={() => {}}
                onCloseDetail={() => {}}
                snap={snap}
                onSnapChange={onSnapChange}
              />
            </ToastProvider>
          </OfflineQueueProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    const peekHeader = container.querySelector('[data-peek-pinned="true"]') as HTMLElement
    const body = container.querySelector('[data-sheet-body]') as HTMLElement
    // 핸들 버튼만(백드롭 ' 시트 접기'와 구별 — 핸들 라벨은 '시트 펼치기' 또는 '시트 단계 전환(접기)').
    const handleBtn = screen.getByRole('button', { name: /시트 펼치기|시트 단계 전환/ })
    return { onSnapChange, peekHeader, body, handleBtn }
  }

  // 합성-click 이중 cycle은 controlled snap이 실제로 갱신돼 다음 cycleSnap이 '새 snap'에서 계산될 때만
  // 최종 상태로 드러난다(static spy는 같은 stale snap에서 같은 값을 두 번 내므로 end-state가 안 변함).
  // 따라서 useState로 snap을 실제 보유하는 '현실적 부모' 하베스로 end-state를 검증한다.
  function renderRealisticParent(initial: SnapStop = 'peek') {
    const onSnapChange = vi.fn()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const RealisticHarness = () => {
      const [snap, setSnap] = useState<SnapStop>(initial)
      return (
        <PlaceSheet
          coupleId="c1"
          myId="u1"
          coupleActive
          places={[aPlace]}
          visitedIds={new Set<string>()}
          placesLoading={false}
          selectedId={null}
          previewHit={null}
          reactions={{}}
          onSave={() => {}}
          onCloseDetail={() => {}}
          snap={snap}
          onSnapChange={(s) => {
            onSnapChange(s)
            setSnap(s)
          }}
        />
      )
    }
    const { container } = render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <OfflineQueueProvider>
            <ToastProvider>
              <RealisticHarness />
            </ToastProvider>
          </OfflineQueueProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    const peekHeader = container.querySelector('[data-peek-pinned="true"]') as HTMLElement
    const handleBtn = screen.getByRole('button', { name: /시트 펼치기|시트 단계 전환/ })
    return { onSnapChange, peekHeader, handleBtn }
  }

  // 핵심 회귀: 핸들 버튼 '직접 탭'은 pointerdown(무이동)+pointerup+click 순서로 발생한다.
  // pointerup이 헤더로 버블 → no-move 분기 cycleSnap, 이어 버튼 onClick → cycleSnap. 가드 없으면 이중 cycle.
  it('핸들 버튼 직접 탭(pointerdown 무이동+pointerup+click)은 cycleSnap을 정확히 1회만 부른다(이중 cycle 방지)', () => {
    const { onSnapChange, peekHeader, handleBtn } = renderRealisticParent('peek')
    // 실제 탭: 헤더에서 pointerdown→(이동 없음)→pointerup, 그 뒤 버튼으로 합성 click.
    firePointer(peekHeader, 'pointerDown', 600)
    firePointer(peekHeader, 'pointerUp', 600) // 0px 이동 = 탭
    fireEvent.click(handleBtn)
    // no-move 탭 1회만 효력 — 합성 click의 두 번째 cycle은 justDraggedRef로 삼켜진다.
    expect(onSnapChange).toHaveBeenCalledTimes(1)
    // peek → nextSnap = half. (이중 cycle이면 half를 건너뛰고 full로 튄다.)
    expect(onSnapChange).toHaveBeenCalledWith('half')
  })

  it('half에서 핸들 버튼 직접 탭은 full로 한 단계만 올린다(이중 cycle 시 half→full→half로 무동작)', () => {
    const { onSnapChange, peekHeader, handleBtn } = renderRealisticParent('half')
    firePointer(peekHeader, 'pointerDown', 600)
    firePointer(peekHeader, 'pointerUp', 600)
    fireEvent.click(handleBtn)
    expect(onSnapChange).toHaveBeenCalledTimes(1)
    expect(onSnapChange).toHaveBeenLastCalledWith('full')
  })

  it('peekHeader 위에서 6px 초과 드래그 → onSnapChange가 새 스냅으로 호출된다', () => {
    const { onSnapChange, peekHeader } = renderWithSpy('peek')
    // 위로 끌어올림(아래→위 = 펼치기) — clientY 감소, 임계(6px) 초과.
    firePointer(peekHeader, 'pointerDown', 600)
    firePointer(peekHeader, 'pointerMove', 580)
    firePointer(peekHeader, 'pointerMove', 400)
    firePointer(peekHeader, 'pointerUp', 400)
    expect(onSnapChange).toHaveBeenCalled()
  })

  it('peekHeader 탭(6px 미만 이동) → cycleSnap(스냅 1단계)만, 드래그-정착 아님', () => {
    const { onSnapChange, peekHeader } = renderWithSpy('peek')
    firePointer(peekHeader, 'pointerDown', 600)
    firePointer(peekHeader, 'pointerMove', 603) // 3px < 6px = 탭
    firePointer(peekHeader, 'pointerUp', 603)
    // peek에서 탭 = nextSnap → half.
    expect(onSnapChange).toHaveBeenCalledTimes(1)
    expect(onSnapChange).toHaveBeenCalledWith('half')
  })

  it('드래그-릴리즈 직후 합성 click이 cycleSnap을 또 호출하지 않는다(justDraggedRef 가드)', () => {
    const { onSnapChange, peekHeader, handleBtn } = renderWithSpy('peek')
    firePointer(peekHeader, 'pointerDown', 600)
    firePointer(peekHeader, 'pointerMove', 560) // 40px > 6px = 드래그
    firePointer(peekHeader, 'pointerUp', 560)
    // pointerup이 click보다 먼저 → justDraggedRef=true → 뒤이은 click은 무시되어야 한다.
    fireEvent.click(handleBtn)
    // 드래그 정착 1회만, 합성 click의 cycle은 삼켜짐.
    expect(onSnapChange).toHaveBeenCalledTimes(1)
  })

  it('body가 scrollTop=0일 때 아래로 끌면 한 단계 접힌다(pull-down collapse)', () => {
    const { onSnapChange, body } = renderWithSpy('half')
    // scrollTop은 jsdom 기본 0 — 아래로(=clientY 증가) 임계 초과 드래그.
    firePointer(body, 'pointerDown', 100)
    firePointer(body, 'pointerMove', 140) // +40px > 6px, 아래로
    firePointer(body, 'pointerUp', 140)
    // half → prevSnap → peek.
    expect(onSnapChange).toHaveBeenCalledWith('peek')
  })

  // 회귀: 필터 칩은 peekHeader의 자식이므로 칩 탭의 pointerdown→pointerup이 헤더로 버블한다.
  // no-move 분기가 cycleSnap을 부르면 '필터 선택'이 시트 단계까지 바꾸는 부작용이 생긴다(잡혀야 함).

  // 칩에서 시작한 6px 초과 이동(가로 스크롤 등)도 시트를 드래그하지 않는다(드래그 표면에서 칩 제외).
})

describe('PlaceSheet — 가봤음 취소 상태별 토스트(R1.2: 무동작 성공 제거)', () => {
  beforeEach(() => {
    h.state.selectResult = { data: [], error: null }
    h.softDelete.mockClear()
    h.softDelete.mockResolvedValue({ status: 'ok' })
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true })
  })

  // 상세에서 가봤음 취소 버튼을 눌렀을 때(visited=true) status에 따른 토스트를 검증.
  function renderVisited() {
    return renderSheet({
      places: [aPlace],
      selectedId: 'p1',
      visitedIds: new Set(['p1']),
    })
  }

  // 상세(상단)와 목록 카드 양쪽에 같은 라벨의 취소 버튼이 있으므로 상세 영역으로 한정해 클릭.
  function clickDetailUnvisit() {
    const detail = screen.getByLabelText('장소 상세')
    fireEvent.click(within(detail).getByRole('button', { name: '칠성조선소 가봤음 기록 취소' }))
  }

  it('removed → "가봤음을 취소했어요" + 되돌리기 Undo 토스트(Task 18)', async () => {
    h.state.selectResult = { data: [{ id: 'v1', version: 1 }], error: null }
    h.softDelete.mockResolvedValue({ status: 'ok' })
    renderVisited()
    clickDetailUnvisit()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('가봤음을 취소했어요'))
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeInTheDocument()
  })

  it('noop → "이미 취소된 기록이에요" 토스트(가짜 성공 메시지 금지)', async () => {
    h.state.selectResult = { data: [], error: null } // 살아있는 행 없음 → noop
    renderVisited()
    clickDetailUnvisit()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('이미 취소된 기록이에요'))
    expect(screen.queryByText('가봤음을 취소했어요')).toBeNull()
  })

  it('conflict → 성공 토스트를 띄우지 않는다(ConflictBanner 경로)', async () => {
    h.state.selectResult = { data: [{ id: 'v1', version: 1 }], error: null }
    h.softDelete.mockResolvedValue({ status: 'conflict' })
    renderVisited()
    clickDetailUnvisit()
    // onConflict → ConflictBanner. 성공/무동작 토스트는 뜨면 안 된다.
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.queryByText('가봤음을 취소했어요')).toBeNull()
    expect(screen.queryByText('이미 취소된 기록이에요')).toBeNull()
  })
})

describe('PlaceSheet — 저장·방문 토글 햅틱 배선(R4.1: 성공/제거에만, 시각 피드백 병행)', () => {
  beforeEach(() => {
    vi.mocked(haptic).mockClear()
    h.state.selectResult = { data: [], error: null }
    h.softDelete.mockClear()
    h.softDelete.mockResolvedValue({ status: 'ok' })
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true })
  })

  it('"다녀왔어요"(markVisited 성공) 시 haptic이 호출된다(성공 피드백 + 토스트 병행)', async () => {
    // 미방문 place → 상세에 '다녀왔어요' 버튼 노출. insert 성공(onLine=true + q.insert error:null) → onSuccess.
    renderSheet({ places: [aPlace], selectedId: 'p1', visitedIds: new Set<string>() })
    const detail = screen.getByLabelText('장소 상세')
    fireEvent.click(within(detail).getByRole('button', { name: '칠성조선소 다녀왔어요' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('가봤어요로 기록했어요'))
    expect(haptic).toHaveBeenCalledTimes(1)
  })

  it('가봤음 취소가 noop(제거 안 됨)이면 haptic은 호출되지 않는다(removed에만)', async () => {
    h.state.selectResult = { data: [], error: null } // 살아있는 행 없음 → noop
    renderSheet({ places: [aPlace], selectedId: 'p1', visitedIds: new Set(['p1']) })
    const detail = screen.getByLabelText('장소 상세')
    fireEvent.click(within(detail).getByRole('button', { name: '칠성조선소 가봤음 기록 취소' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('이미 취소된 기록이에요'))
    expect(haptic).not.toHaveBeenCalled()
  })

  it('가봤음 취소가 removed면 haptic이 호출된다(제거 성공 피드백)', async () => {
    h.state.selectResult = { data: [{ id: 'v1', version: 1 }], error: null }
    h.softDelete.mockResolvedValue({ status: 'ok' })
    renderSheet({ places: [aPlace], selectedId: 'p1', visitedIds: new Set(['p1']) })
    const detail = screen.getByLabelText('장소 상세')
    fireEvent.click(within(detail).getByRole('button', { name: '칠성조선소 가봤음 기록 취소' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('가봤음을 취소했어요'))
    expect(haptic).toHaveBeenCalledTimes(1)
  })

  it('❤️ 리액션 토글(onReact) 탭 시 mutate와 같은 시점에 haptic이 호출된다(낙관적, 시각 칩 병행)', () => {
    renderSheet({ places: [aPlace], selectedId: 'p1' })
    const detail = screen.getByLabelText('장소 상세')
    // 리액션 버튼 aria-label: `{name} — {상태 문장}`(예: "… — 상대가 하트를 눌렀어요").
    // 예전엔 "하트 리액션 (총 N개)"였는데 숫자만으론 누가 눌렀는지 못 읽어 상태 문장으로 바꿨다.
    // 탭 시점(낙관적)에 haptic 발화하는 계약 자체는 그대로다.
    fireEvent.click(within(detail).getByRole('button', { name: /하트/ }))
    expect(haptic).toHaveBeenCalledTimes(1)
  })
})

// 컬렉션 칩(가산 필터)·[목록 관리] 검증은 장소 탭으로 옮겼다 → src/__tests__/placesPage.test.tsx.
// 시트에는 더 이상 필터 행이 없다.
