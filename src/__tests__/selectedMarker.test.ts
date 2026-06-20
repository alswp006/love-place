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

  it('글리프를 ≥44px 히트영역 래퍼로 감싼다(터치 타깃, ux §1·tip 앵커 유지)', () => {
    const html = markerIconHtml({ glyph: '☆', pinClass: 'pin', label: '카페 — 가고싶음', selected: false })
    // CSS 모듈 스코프(_pinHit_xxx)는 원본 케이스를 보존하므로 'pinHit'로 검사.
    expect(html).toContain('pinHit')
    // 히트 래퍼가 aria-label을 보유(접근성 라벨은 외곽 컨테이너에).
    expect(html).toMatch(/pinHit[^>]*aria-label/)
    // 내부 핀 div가 글리프를 담는다.
    expect(html).toContain('☆')
  })

  it('선택 시 pinSelected는 내부 핀 div에 붙고 히트 래퍼는 유지된다', () => {
    const html = markerIconHtml({ glyph: '♥', pinClass: 'pin pinBoth', label: '카페 — 둘 다 찜', selected: true, badge: undefined })
    expect(html).toContain('pinHit')
    expect(html).toContain('pinSelected')
    // pinSelected는 히트 래퍼가 아니라 안쪽 핀에 위치(히트 래퍼가 글리프를 감싼다).
    const hitIdx = html.indexOf('pinHit')
    const selIdx = html.indexOf('pinSelected')
    expect(selIdx).toBeGreaterThan(hitIdx)
  })

  it('badge가 히트 래퍼 안쪽 핀에 함께 렌더된다', () => {
    const html = markerIconHtml({ glyph: '★', pinClass: 'pin pinVisited', label: '카페 — 가봤음', selected: false, badge: '✓' })
    expect(html).toContain('pinHit')
    expect(html).toContain('✓')
  })

  // 프리뷰(미저장 검색 후보) 마커도 같은 헬퍼를 거쳐 .pinHit 래퍼(tip 앵커 보정+≥44px)를 받아야 한다.
  // .pin 자체엔 translate가 없으므로 직접 렌더하면 좌표에서 오프셋됨(Task 17 회귀 방지).
  it('프리뷰 핀(＋·pinPreview)도 pinHit 래퍼로 감싸진다(tip 앵커·터치 타깃)', () => {
    const html = markerIconHtml({ glyph: '＋', pinClass: 'pin pinPreview', label: '새 후보 식당 미리보기', selected: false })
    expect(html).toContain('pinHit')
    expect(html).toContain('pinPreview')
    expect(html).toContain('＋')
    // pinPreview는 히트 래퍼 안쪽 핀 div에 위치(래퍼가 글리프를 감싼다).
    const hitIdx = html.indexOf('pinHit')
    const previewIdx = html.indexOf('pinPreview')
    expect(previewIdx).toBeGreaterThan(hitIdx)
    // 라벨은 외곽 히트 래퍼에 위치(접근성 라벨은 컨테이너에).
    expect(html).toMatch(/pinHit[^>]*aria-label[^>]*새 후보 식당 미리보기/)
  })
})
