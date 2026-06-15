import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { KakaoPlaceHit } from '@/lib/kakao/types'

const hits: KakaoPlaceHit[] = [
  { kakaoPlaceId: 'saved1', name: '저장된 카페', address: '속초', lat: 38, lng: 128, category: '카페', placeUrl: '' },
  { kakaoPlaceId: 'new1', name: '새 식당', address: '강릉', lat: 37.7, lng: 128.9, category: '식당', placeUrl: '' },
]

// useKakaoSearch를 done+hits 상태로 모킹(검색 호출 없이 결과 렌더).
vi.mock('@/hooks/useKakaoSearch', () => ({
  useKakaoSearch: () => ({ query: '카', setQuery: () => {}, clear: () => {}, status: 'done', hits, error: null }),
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
})
