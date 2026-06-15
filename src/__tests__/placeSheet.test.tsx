import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import type { SnapStop } from '@/lib/places/sheetSnap'

// PlaceSheet는 데이터 훅(useWishes/useVisits 등)을 직접 호출하지 않고 props로 받는 표현형 컴포넌트.
// 검색(PlaceSearch)은 시트가 아니라 지도 위 상단 오버레이(MapPage)로 옮겨졌으므로 여기서 mock하지 않는다.

import { OfflineQueueProvider } from '@/state/OfflineQueueProvider'
import { PlaceSheet } from '@/components/places/PlaceSheet'

// PlaceSheet가 보유하는 쓰기 훅(useSetWishPriority/useDeletePlace/useRestorePlace)은 내부에서
// useOfflineQueue()를 호출 → <OfflineQueueProvider> 조상이 없으면 throw. 따라서 시트를 마운트하는
// 모든 테스트는 OfflineQueueProvider로 감싼다. (jsdom에는 indexedDB가 없어 outboxStore가 자동으로
// 메모리 스토어로 폴백하고 navigator.onLine도 정의돼 있으므로 추가 mock은 불필요.)
// renderSheet: wrap PlaceSheet so snap stays interactive in tests(controlled snap → MapPage가 정본).
function Harness(props: Omit<Parameters<typeof PlaceSheet>[0], 'snap' | 'onSnapChange'>) {
  const [snap, setSnap] = useState<SnapStop>('peek')
  return <PlaceSheet {...props} snap={snap} onSnapChange={setSnap} />
}

function renderSheet(over: Partial<Parameters<typeof PlaceSheet>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const props: Omit<Parameters<typeof PlaceSheet>[0], 'snap' | 'onSnapChange'> = {
    coupleId: 'c1',
    myId: 'u1',
    coupleActive: true,
    places: [],
    wishes: { byPlace: {}, mine: {} },
    visits: [],
    visitedIds: new Set<string>(),
    placesLoading: false,
    selectedId: null,
    onSelect: () => {},
    ...over,
  }
  return render(
    <QueryClientProvider client={qc}>
      <OfflineQueueProvider>
        <Harness {...props} />
      </OfflineQueueProvider>
    </QueryClientProvider>,
  )
}

describe('PlaceSheet (드래그 시트)', () => {
  it('시트는 항상 보이는 패널이므로 role=region + aria-label(modal 아님, spec §3.7)', () => {
    renderSheet()
    expect(screen.getByRole('region', { name: '장소 시트' })).toBeInTheDocument()
  })

  it('핸들 버튼에 aria-expanded(peek=false)가 있다', () => {
    renderSheet()
    const btn = screen.getByRole('button', { name: /시트/ })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
  })

  it('핸들에 탭 대체 버튼(스냅 전환)을 제공한다(제스처 발견성 보완)', () => {
    renderSheet()
    expect(screen.getByRole('button', { name: /시트 펼치기|시트 단계 전환/ })).toBeInTheDocument()
  })

  it('탭 대체 버튼 클릭 시 시트 단계가 올라간다(aria-label 변화)', () => {
    renderSheet()
    const btn = screen.getByRole('button', { name: /시트/ })
    fireEvent.click(btn)
    // peek→half로 올라가면 다음 라벨은 여전히 펼치기(half→full)거나 dialog가 확장됨.
    expect(screen.getByRole('region', { name: '장소 시트' })).toBeInTheDocument()
  })

  it('필터 칩(전체/가고싶음/가봤음)은 peek 헤더(핸들/요약 영역)에 렌더된다(§5 peek 콘텐츠)', () => {
    renderSheet()
    // peek-pinned 헤더 그룹 — body(접힘 영역)가 아니라 항상 보이는 영역에 있어야 한다.
    const group = screen.getByRole('group', { name: '장소 필터' })
    expect(group).toBeInTheDocument()
    expect(group.closest('[data-peek-pinned="true"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: '전체' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '가고싶은' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '가본' })).toBeInTheDocument()
  })

  it('peek에서 selectedId가 생기면 half로 살짝 올린다(§6 (c))', () => {
    // 같은 provider 트리에서 selectedId만 바꿔 effect가 발화하도록(리마운트 시 내부 snap이 초기화됨).
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const SelHarness = ({ selectedId }: { selectedId: string | null }) => {
      const [snap, setSnap] = useState<SnapStop>('peek')
      return (
        <QueryClientProvider client={qc}>
          <OfflineQueueProvider>
            <PlaceSheet
              coupleId="c1"
              myId="u1"
              coupleActive
              places={[]}
              wishes={{ byPlace: {}, mine: {} }}
              visits={[]}
              visitedIds={new Set<string>()}
              placesLoading={false}
              selectedId={selectedId}
              onSelect={() => {}}
              snap={snap}
              onSnapChange={setSnap}
            />
          </OfflineQueueProvider>
        </QueryClientProvider>
      )
    }
    const { rerender } = render(<SelHarness selectedId={null} />)
    const sheet = screen.getByRole('region', { name: '장소 시트' })
    const peekY = sheet.style.transform
    // 선택 발생(마커 클릭 등) → peek면 half로 상향(같은 인스턴스, prop만 변경).
    rerender(<SelHarness selectedId="p1" />)
    expect(sheet.style.transform).not.toBe(peekY)
  })

  it('커플 미연결이면 연결 안내 빈 상태를 보여준다', () => {
    renderSheet({ coupleActive: false })
    expect(screen.getByText('먼저 상대와 연결해요')).toBeInTheDocument()
  })

  it('연결 상태면 필터·목록을 호스팅하되 여행/휴지통 섹션은 더는 렌더하지 않는다(P4)', () => {
    renderSheet()
    expect(screen.queryByTestId('place-search')).not.toBeInTheDocument()
    expect(screen.queryByTestId('trips-section')).not.toBeInTheDocument()
    // 휴지통 토글은 '우리' 탭으로 이동 — 시트엔 없음.
    expect(screen.queryByRole('button', { name: /휴지통/ })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: '장소 필터' })).toBeInTheDocument()
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

  it('half/full 확장 시 백드롭이 뜨고 탭하면 peek로 접힌다', () => {
    renderSheet()
    const handle = screen.getByRole('button', { name: /시트/ })
    fireEvent.click(handle) // peek→half
    const backdrop = screen.getByRole('button', { name: '시트 접기' })
    expect(backdrop).toBeInTheDocument()
    fireEvent.click(backdrop)
    expect(screen.queryByRole('button', { name: '시트 접기' })).toBeNull()
  })
})
