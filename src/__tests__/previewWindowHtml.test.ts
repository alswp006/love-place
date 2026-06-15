import { describe, it, expect } from 'vitest'
import { previewWindowHtml } from '@/lib/places/infoWindowHtml'
import type { KakaoPlaceHit } from '@/lib/kakao/types'

const hit: KakaoPlaceHit = {
  kakaoPlaceId: 'k1',
  name: '속초 "칠성조선소',
  address: '강원 속초시',
  lat: 38,
  lng: 128.5,
  category: '카페',
  placeUrl: 'https://x',
}

describe('previewWindowHtml (검색 프리뷰 말풍선 — 순수)', () => {
  it('이름을 이스케이프하고 카테고리·주소를 포함한다', () => {
    const html = previewWindowHtml(hit)
    expect(html).toContain('속초 &quot;칠성조선소')
    expect(html).toContain('카페')
    expect(html).toContain('강원 속초시')
  })

  it('[저장]·[길찾기] 액션에 data-action(save/directions)과 data-id(kakaoPlaceId)를 부여한다', () => {
    const html = previewWindowHtml(hit)
    expect(html).toContain('data-action="save"')
    expect(html).toContain('data-action="directions"')
    expect(html).toContain('data-action="close"')
    expect(html).toContain('data-id="k1"')
  })

  it('class="undefined"가 없어야 한다(CSS module 누락 회귀 방지)', () => {
    expect(previewWindowHtml(hit)).not.toContain('class="undefined"')
  })
})
