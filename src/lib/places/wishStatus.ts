// 찜(wish) 상태 도출 — 순수 함수(vitest로 못박음). DB 변경 0: 이미 저장된 wishes를 화면용으로 가공(3단계).
// "가고싶음 = wishes 존재"(CLAUDE.md §7) 원칙 — 상태 플래그를 만들지 않고 wishes에서 런타임 도출.

/** place별 찜 집계(useWishes가 만든다). */
export type WishInfo = {
  userIds: string[] // 누가 찜했나(중복 제거, 커플 멤버 ≤2)
  totalPriority: number // 우선순위(하트) 합 — 정렬용
  maxPriority: number // 최고 우선순위 — 표시용
}

/** 한 장소의 찜 상태(보는 사람 기준). */
export type WishStatus = {
  wishedByMe: boolean
  wishedByPartner: boolean
  bothWished: boolean // 둘 다 찜 = 커플 앱 핵심 신호(§4.2)
  wishCount: number
  totalPriority: number
  maxPriority: number
}

/**
 * wishInfo + 내 user id → 보는 사람 기준 상태.
 * myId가 null(세션 미로딩)이어도 bothWished는 인원수로 견고하게 도출
 * (place×user UNIQUE + 멤버 ≤2이므로 2명이면 둘 다 찜).
 */
export function deriveWishStatus(info: WishInfo | undefined, myId: string | null): WishStatus {
  const userIds = info?.userIds ?? []
  const wishedByMe = myId != null && userIds.includes(myId)
  // myId 미상(세션 미로딩)이면 '상대 것'으로 단정하지 않는다('나만 찜'→'상대만 찜' 일시 오표시 방지).
  const wishedByPartner = myId != null && userIds.some((id) => id !== myId)
  return {
    wishedByMe,
    wishedByPartner,
    bothWished: userIds.length >= 2,
    wishCount: userIds.length,
    totalPriority: info?.totalPriority ?? 0,
    maxPriority: info?.maxPriority ?? 0,
  }
}

/** 정렬 비교자: 둘 다 찜 → 찜 인원 → 우선순위 합. 동률=0(호출부 안정 정렬이 최신순 유지). */
export function compareByWish(a: WishStatus, b: WishStatus): number {
  if (a.bothWished !== b.bothWished) return a.bothWished ? -1 : 1
  if (a.wishCount !== b.wishCount) return b.wishCount - a.wishCount
  if (a.totalPriority !== b.totalPriority) return b.totalPriority - a.totalPriority
  return 0
}

/** 우선순위 하트 최대 단계. */
export const MAX_PRIORITY = 3

/** 하트 탭 시 우선순위 순환: 0→1→2→3→0. 순수 함수(테스트로 못박음). */
export function cyclePriority(current: number): number {
  return current >= MAX_PRIORITY ? 0 : current + 1
}

export type WithWish<T> = T & { wish: WishStatus }

/**
 * places에 wish 상태를 붙이고 "뭐부터 갈까" 순으로 정렬.
 * 입력이 created_at desc면 동률은 최신순 유지(JS Array.sort는 ES2019부터 안정 정렬).
 */
export function attachAndSortWishes<T extends { id: string }>(
  places: T[],
  wishes: Record<string, WishInfo>,
  myId: string | null,
): WithWish<T>[] {
  return places
    .map((p) => ({ ...p, wish: deriveWishStatus(wishes[p.id], myId) }))
    .sort((a, b) => compareByWish(a.wish, b.wish))
}
