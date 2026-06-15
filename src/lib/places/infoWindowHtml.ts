import type { PlaceRow } from '@/hooks/usePlaces'
import { markerVisual } from '@/lib/places/markerVisual'
import type { WithWish } from '@/lib/places/wishStatus'
import iwStyles from '@/components/map/InfoWindow.module.css'

// 말풍선 HTML 문자열 — 순수 함수(테스트로 못박음). naver/DOM 비의존, 사용자 텍스트는 전부 이스케이프.
// 상태/소유자는 색+글리프+텍스트 이중화(§8). 액션 버튼은 data-action/data-id(위임 핸들러가 읽음).

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 편차: 장소 말풍선 출처 아바타 제거(ux §2 예외, spec §3.2). profiles/myId 인자 제거.
export function infoWindowHtml(
  place: WithWish<PlaceRow>,
  state: { visited: boolean; didIReact: boolean; count: number },
): string {
  const visual = markerVisual({
    visited: state.visited,
    bothWished: place.wish.bothWished,
    name: place.name,
  })
  const name = escapeHtml(place.name)
  const id = escapeHtml(place.id)
  const meta = [place.category, place.region_label]
    .filter((x): x is string => Boolean(x))
    .map((x) => escapeHtml(x))
    .join(' · ')
  const statusText =
    visual.kind === 'visited' ? '가봤음' : visual.kind === 'both' ? '둘 다 찜' : '가고싶음'
  const heart = state.didIReact ? '❤️' : '🤍'
  // ❤️ 총 개수(spec §3·§7) — 1 이상이면 하트 옆에 숫자, 0이면 숨김.
  const countLabel = state.count > 0 ? ` ${state.count}` : ''
  // 방문 토글(spec §3.3): 미방문→가봤어요(visit), 가봤음→취소(unvisit). 색+텍스트 이중화(§8).
  const visitAction = state.visited
    ? `<button type="button" class="${iwStyles.action} ${iwStyles.actionDone}" data-action="unvisit" data-id="${id}" aria-label="${name} 가봤음 기록 취소">✅ 가봤음 (취소)</button>`
    : `<button type="button" class="${iwStyles.action}" data-action="visit" data-id="${id}" aria-label="${name} 가봤어요로 기록">✅ 가봤어요</button>`

  return [
    `<div class="${iwStyles.bubble}" role="dialog" aria-label="${name} 정보">`,
    `<button type="button" class="${iwStyles.close}" data-action="close" data-id="${id}" aria-label="닫기">✕</button>`,
    `<div class="${iwStyles.head}">`,
    `<span class="${iwStyles.glyph}" aria-hidden>${visual.glyph}</span>`,
    `<span class="${iwStyles.name}">${name}</span>`,
    `</div>`,
    `<div class="${iwStyles.sub}">`,
    `<span class="${iwStyles.status}">${escapeHtml(statusText)}</span>`,
    meta ? `<span class="${iwStyles.meta}">${meta}</span>` : '',
    `</div>`,
    `<div class="${iwStyles.actions}">`,
    `<button type="button" class="${iwStyles.action}" data-action="directions" data-id="${id}" aria-label="${name} 길찾기">🧭 길찾기</button>`,
    visitAction,
    `<button type="button" class="${iwStyles.action}" data-action="react" data-id="${id}" aria-label="${name} 하트 리액션 (총 ${state.count}개)">${heart}${countLabel}</button>`,
    `</div>`,
    `</div>`,
  ].join('')
}
