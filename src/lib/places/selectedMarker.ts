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
}): string {
  const cls = `${opts.pinClass}${opts.selected ? ` ${pin.pinSelected}` : ''}`.trim()
  return `<div class="${cls}" aria-label="${escapeHtml(opts.label)}">${opts.glyph}</div>`
}
