import type { ProfileMap } from '@/hooks/useProfiles'
import type { PlaceRow } from '@/hooks/usePlaces'
import { markerVisual } from '@/lib/places/markerVisual'
import type { WithWish } from '@/lib/places/wishStatus'
import iwStyles from '@/components/map/InfoWindow.module.css'
import avStyles from '@/components/common/SourceAvatar.module.css'

// 말풍선 HTML 문자열 — 순수 함수(테스트로 못박음). naver/DOM 비의존, 사용자 텍스트는 전부 이스케이프.
// 상태/소유자는 색+글리프+텍스트 이중화(§8). 액션 버튼은 data-action/data-id(위임 핸들러가 읽음).

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// SourceAvatar와 동일한 색/이니셜 도출을 HTML 문자열로 재현(React 컴포넌트는 문자열에 못 씀).
export function avatarHtml(userId: string, profiles: ProfileMap, myId: string | null): string {
  const p = profiles[userId]
  const isMe = userId === myId
  const name = p?.displayName.trim() || (isMe ? '나' : '상대')
  const color = p?.color ?? 'var(--c-text-weak)'
  const initial = escapeHtml(name.slice(0, 1).toUpperCase())
  const label = escapeHtml(`${name} 추가`)
  const inner = p?.avatarUrl
    ? `<img src="${escapeHtml(p.avatarUrl)}" alt="" class="${avStyles.img}" />`
    : initial
  return `<span class="${avStyles.avatar}" style="background-color:${escapeHtml(color)}" aria-label="${label}" title="${label}">${inner}</span>`
}

export function infoWindowHtml(
  place: WithWish<PlaceRow>,
  profiles: ProfileMap,
  myId: string | null,
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
  // 이미 가봤음이면 누를 수 있는 visit 액션 대신 비활성 "가봤음" 상태(중복 방문 insert 방지, spec §3).
  const visitAction = state.visited
    ? `<span class="${iwStyles.action} ${iwStyles.actionDone}" aria-disabled="true" data-disabled="true" disabled>✅ 가봤음</span>`
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
    avatarHtml(place.added_by, profiles, myId),
    `</div>`,
    `<div class="${iwStyles.actions}">`,
    `<button type="button" class="${iwStyles.action}" data-action="directions" data-id="${id}" aria-label="${name} 길찾기">🧭 길찾기</button>`,
    visitAction,
    `<button type="button" class="${iwStyles.action}" data-action="react" data-id="${id}" aria-label="${name} 하트 리액션 (총 ${state.count}개)">${heart}${countLabel}</button>`,
    `</div>`,
    `</div>`,
  ].join('')
}
