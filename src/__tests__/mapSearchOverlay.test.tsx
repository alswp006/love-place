import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
// rerender 사용 — render 반환값에서 가져옴(별도 import 불필요).

// PlaceSearch는 useKakaoSearch/useSavePlace(오프라인 큐)에 의존 → 오버레이 단위 테스트에선 mock.
vi.mock('@/components/places/PlaceSearch', () => ({
  PlaceSearch: ({ coupleId }: { coupleId: string | null }) => (
    <input data-testid="place-search-input" aria-label="장소 검색" data-couple={coupleId ?? ''} />
  ),
}))

import { MapSearchOverlay } from '@/components/places/MapSearchOverlay'

describe('MapSearchOverlay (지도 위 상단 검색 오버레이, spec §5)', () => {
  it('PlaceSearch를 coupleId와 함께 렌더한다', () => {
    render(<MapSearchOverlay coupleId="c1" savedKakaoIds={new Set<string>()} onPick={() => {}} snap="peek" />)
    const input = screen.getByTestId('place-search-input')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('data-couple', 'c1')
  })

  it('검색 입력은 지도 상단 오버레이(시트 바깥)에 앵커된다 — peek에서도 즉시 도달(≤3탭 보존)', () => {
    const { container } = render(<MapSearchOverlay coupleId="c1" savedKakaoIds={new Set<string>()} onPick={() => {}} snap="peek" />)
    // 오버레이 컨테이너가 검색 입력을 직접 감싸고 data-search-overlay로 표식 → 시트 body 의존 없음.
    const overlay = container.querySelector('[data-search-overlay="true"]')
    expect(overlay).not.toBeNull()
    expect(overlay?.querySelector('[data-testid="place-search-input"]')).not.toBeNull()
  })

  // 계약 변경(의도적): 예전엔 snap>peek면 접었다. 그런데 검색결과를 탭하면 시트가 half로
  // 자동 승격되므로, 그 규칙이면 저장 버튼을 누르기도 전에 검색창이 사라지고 목록은
  // "위 검색창에 장소 이름을 입력하면…"이라는 없는 UI를 가리켰다. half에선 유지하고
  // full(목록 전체 화면)에서만 접는다 — 위시 저장 ≤3탭(§8)을 실제로 지키기 위한 변경.
  it('half에서는 검색 오버레이가 살아 있다 — 승격 직후에도 저장을 이어갈 수 있게', () => {
    const { rerender } = render(
      <MapSearchOverlay coupleId="c1" savedKakaoIds={new Set<string>()} onPick={() => {}} snap="peek" />,
    )
    expect(screen.getByTestId('search-overlay')).not.toHaveAttribute('data-hidden', 'true')
    rerender(
      <MapSearchOverlay coupleId="c1" savedKakaoIds={new Set<string>()} onPick={() => {}} snap="half" />,
    )
    expect(screen.getByTestId('search-overlay')).not.toHaveAttribute('data-hidden', 'true')
  })

  it('full(목록 전체 화면)에서만 접어 시트와 겹치지 않게 한다', () => {
    render(
      <MapSearchOverlay coupleId="c1" savedKakaoIds={new Set<string>()} onPick={() => {}} snap="full" />,
    )
    expect(screen.getByTestId('search-overlay')).toHaveAttribute('data-hidden', 'true')
  })
})
