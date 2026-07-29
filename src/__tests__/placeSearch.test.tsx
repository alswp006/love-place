import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { KakaoPlaceHit } from '@/lib/kakao/types'

const hits: KakaoPlaceHit[] = [
  { kakaoPlaceId: 'saved1', name: '저장된 카페', address: '속초', lat: 38, lng: 128, category: '카페', placeUrl: '' },
  { kakaoPlaceId: 'new1', name: '새 식당', address: '강릉', lat: 37.7, lng: 128.9, category: '식당', placeUrl: '' },
]

// useKakaoSearch를 done+hits 상태로 모킹(검색 호출 없이 결과 렌더).
// clearSpy로 결과 탭 시 clear() 호출을 검증(목록/키보드 닫기 → 프리뷰 노출).
const clearSpy = vi.fn()
vi.mock('@/hooks/useKakaoSearch', () => ({
  useKakaoSearch: () => ({ query: '카', setQuery: () => {}, clear: clearSpy, status: 'done', hits, error: null }),
}))

import { PlaceSearch } from '@/components/places/PlaceSearch'

describe('PlaceSearch (검색 개편 — 프리뷰/선택 위임 + 저장됨 표시)', () => {
  it('저장된 결과엔 ★+"저장됨" 표시, 미저장엔 없음(색+모양 이중화)', () => {
    render(<PlaceSearch coupleId="c1" savedKakaoIds={new Set(['saved1'])} onPick={() => {}} />)
    expect(screen.getByText('저장된 카페').closest('button')).toHaveTextContent('저장됨')
    expect(screen.getByText('새 식당').closest('button')).not.toHaveTextContent('저장됨')
  })

  it('결과 탭 시 즉시 저장하지 않고 onPick(hit)을 호출한다(≤3탭: 프리뷰에서 저장)', () => {
    const onPick = vi.fn()
    render(<PlaceSearch coupleId="c1" savedKakaoIds={new Set<string>()} onPick={onPick} />)
    fireEvent.click(screen.getByText('새 식당'))
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0]![0]).toMatchObject({ kakaoPlaceId: 'new1' })
  })

  // 계약 변경(의도적): 예전엔 결과 탭 시 clear() + blur()로 검색어와 키보드를 버렸다.
  // 여행 계획 중엔 여러 곳을 몰아 담는 게 기본이라, 한 곳 고를 때마다 지우면 다음 장소가
  // '입력 탭 + 재타이핑'부터 다시 시작한다(곳당 2탭 추가). 특히 iOS Safari는 한 번 내려간
  // 키보드를 사용자 탭 없이 못 올려 blur()가 되돌릴 수 없는 비용이다.
  it('결과 탭 후에도 검색어와 포커스를 유지한다 — 연속 저장', () => {
    clearSpy.mockClear()
    render(<PlaceSearch coupleId="c1" savedKakaoIds={new Set<string>()} onPick={() => {}} />)
    const input = screen.getByLabelText('장소 검색')
    input.focus()
    fireEvent.click(screen.getByText('새 식당'))
    expect(clearSpy).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(input)
  })
})
