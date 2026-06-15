import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// PlaceSearch는 useKakaoSearch/useSavePlace(오프라인 큐)에 의존 → 오버레이 단위 테스트에선 mock.
vi.mock('@/components/places/PlaceSearch', () => ({
  PlaceSearch: ({ coupleId }: { coupleId: string | null }) => (
    <input data-testid="place-search-input" aria-label="장소 검색" data-couple={coupleId ?? ''} />
  ),
}))

import { MapSearchOverlay } from '@/components/places/MapSearchOverlay'

describe('MapSearchOverlay (지도 위 상단 검색 오버레이, spec §5)', () => {
  it('PlaceSearch를 coupleId와 함께 렌더한다', () => {
    render(<MapSearchOverlay coupleId="c1" savedKakaoIds={new Set<string>()} onPick={() => {}} />)
    const input = screen.getByTestId('place-search-input')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('data-couple', 'c1')
  })

  it('검색 입력은 지도 상단 오버레이(시트 바깥)에 앵커된다 — peek에서도 즉시 도달(≤3탭 보존)', () => {
    const { container } = render(<MapSearchOverlay coupleId="c1" savedKakaoIds={new Set<string>()} onPick={() => {}} />)
    // 오버레이 컨테이너가 검색 입력을 직접 감싸고 data-search-overlay로 표식 → 시트 body 의존 없음.
    const overlay = container.querySelector('[data-search-overlay="true"]')
    expect(overlay).not.toBeNull()
    expect(overlay?.querySelector('[data-testid="place-search-input"]')).not.toBeNull()
  })
})
