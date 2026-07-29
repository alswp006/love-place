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
  id?: string
  /** 여행 Day 스톱 순번(1-based). 있으면 글리프 대신 숫자를 그려 리스트의 번호와 눈으로 잇는다. */
  order?: number
}): string {
  const cls = `${opts.pinClass}${opts.selected ? ` ${pin.pinSelected}` : ''}`.trim()
  const badge = opts.badge ? `<span class="${pin.pinCheck}" aria-hidden>${escapeHtml(opts.badge)}</span>` : ''
  // 순번이 있으면 글리프를 숫자로 대체 — "순서 있는 하루"가 지도에서도 읽힌다.
  // 숫자는 색과 무관하게 읽히므로 색만 의존 금지(§8)에도 부합한다.
  const glyph = opts.order != null ? String(opts.order) : opts.glyph
  // id가 있을 때만 포커스·키 활성화 가능(role=button+tabindex)으로 emit — 위임 keydown이
  // data-place-id로 onSelect를 호출(Task 17, R4.4). id 없는 미리보기핀은 비포커스 유지(선택 대상 아님).
  const kbd = opts.id ? ` role="button" tabindex="0" data-place-id="${escapeHtml(opts.id)}"` : ''
  // ≥44px 히트영역으로 글리프를 감싸되 시각 tip 위치는 유지(anchor 그대로).
  // 접근성 라벨에도 순번을 넣는다(스크린리더가 "3번째 스톱, 영금정"으로 읽게).
  const label = opts.order != null ? `${opts.order}. ${opts.label}` : opts.label
  return `<div class="${pin.pinHit}"${kbd} aria-label="${escapeHtml(label)}"><div class="${cls}" aria-hidden>${glyph}${badge}</div></div>`
}
