import { escapeHtml } from '@/lib/places/infoWindowHtml'
import pin from '@/components/map/NaverMap.module.css'

// 마커 아이콘 HTML 도출(순수). 선택 시 .pinSelected 수식 클래스 추가(확대+링, §8 색+모양 이중화).
export const BASE_ZINDEX = 1
export const SELECTED_ZINDEX = 1000

export function markerIconHtml(opts: {
  glyph: string
  pinClass: string
  label: string
  selected: boolean
  badge?: string
}): string {
  const cls = `${opts.pinClass}${opts.selected ? ` ${pin.pinSelected}` : ''}`.trim()
  const badge = opts.badge ? `<span class="${pin.pinCheck}" aria-hidden>${escapeHtml(opts.badge)}</span>` : ''
  // ≥44px 히트영역으로 글리프를 감싸되 시각 tip 위치는 유지(anchor 그대로).
  return `<div class="${pin.pinHit}" aria-label="${escapeHtml(opts.label)}"><div class="${cls}" aria-hidden>${opts.glyph}${badge}</div></div>`
}
