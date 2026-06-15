import { describe, it, expect } from 'vitest'
import { markerIconHtml, SELECTED_ZINDEX, BASE_ZINDEX } from '@/lib/places/selectedMarker'

describe('selectedMarker (선택 마커 강조 — 순수)', () => {
  it('선택되지 않은 마커는 selected 클래스/링이 없다', () => {
    const html = markerIconHtml({ glyph: '☆', pinClass: 'pin', label: '카페 — 가고싶음', selected: false })
    expect(html).toContain('☆')
    expect(html).toContain('카페 — 가고싶음')
    // CSS 모듈 스코프 클래스(_pinSelected_xxx)는 원본 케이스를 보존하므로 'pinSelected'로 검사.
    expect(html).not.toContain('pinSelected')
  })

  it('선택된 마커는 selected 수식 클래스를 포함한다(확대+링)', () => {
    const html = markerIconHtml({ glyph: '♥', pinClass: 'pin pinBoth', label: '카페 — 둘 다 찜', selected: true })
    expect(html).toContain('pinSelected')
  })

  it('라벨의 따옴표는 이스케이프된다', () => {
    const html = markerIconHtml({ glyph: '★', pinClass: 'pin', label: '카"페', selected: false })
    expect(html).toContain('카&quot;페')
  })

  it('선택 zIndex는 기본보다 크다(앞으로 끌어올림)', () => {
    expect(SELECTED_ZINDEX).toBeGreaterThan(BASE_ZINDEX)
  })

  it('badge가 주어지면 체크 배지 스팬이 렌더된다', () => {
    const html = markerIconHtml({ glyph: '★', pinClass: 'pin pinVisited', label: '카페 — 가봤음', selected: false, badge: '✓' })
    expect(html).toContain('✓')
  })
})
