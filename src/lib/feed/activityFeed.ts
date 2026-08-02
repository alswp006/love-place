// 인앱 활동 피드 도출 — 순수 함수(테스트로 못박음).
// ux-and-accessibility.md §6: iOS 웹푸시 제약(PWA 홈화면 + 16.4+) 때문에 **인앱 피드가 1차 알림 수단**이다.
//
// [범위 — 정직하게]
// 감사 필드(created_at/created_by)에서 도출하므로 **"상대가 무엇을 추가/기록했나"까지만** 덮는다.
// "지웠어요/바꿨어요"는 구조적으로 만들 수 없다: 모든 조회가 deleted_at IS NULL로 거르고
// updated_at/updated_by는 화면 경로에서 쓰지 않는다. 화면 문구도 그 범위에 맞춘다
// (없는 신호를 있는 척하지 않는다).

export type ActivityKind = 'place' | 'visit' | 'trip' | 'event' | 'comment'

export type ActivitySource = {
  id: string
  kind: ActivityKind
  /** 표시용 이름(장소명·여행명·일정 제목·댓글 본문 등). 비면 kind 기본 문구로 대체. */
  name: string | null
  createdAt: string
  createdBy: string
}

export type ActivityItem = {
  id: string
  kind: ActivityKind
  /** "'칠성조선소'를 가고싶은 곳에 담았어요" — 주어(상대)는 화면이 아바타·이름으로 붙인다. */
  text: string
  createdAt: string
  actorId: string
}

const FALLBACK: Record<ActivityKind, string> = {
  place: '새 장소',
  visit: '어떤 장소',
  trip: '새 여행',
  event: '새 일정',
  comment: '일정',
}

function phrase(kind: ActivityKind, name: string): string {
  switch (kind) {
    case 'place':
      return `‘${name}’를 가고싶은 곳에 담았어요`
    case 'visit':
      return `‘${name}’에 다녀왔어요`
    case 'trip':
      return `‘${name}’ 여행을 만들었어요`
    case 'event':
      return `‘${name}’ 일정을 만들었어요`
    case 'comment':
      return `일정에 “${name}” 라고 남겼어요`
  }
}

/** 댓글 본문은 길 수 있어 피드에선 줄인다(전문은 그 일정에서 본다). */
export function truncate(s: string, max = 40): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`
}

/**
 * 여러 테이블의 감사 행 → 최신순 활동 목록.
 * - **내가 한 일은 뺀다**: 피드의 목적은 "상대가 뭘 했는지" 알리는 것이라 내 행동은 노이즈다.
 * - 미래 시각(시계 어긋남)도 그대로 정렬한다 — 임의 보정하지 않는다.
 */
export function buildActivityFeed(
  sources: readonly ActivitySource[],
  myId: string | null,
  max = 8,
): ActivityItem[] {
  return sources
    .filter((s) => s.createdBy !== myId)
    .map((s) => ({
      id: `${s.kind}:${s.id}`,
      kind: s.kind,
      text: phrase(s.kind, truncate((s.name ?? '').trim() || FALLBACK[s.kind])),
      createdAt: s.createdAt,
      actorId: s.createdBy,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, max)
}

/** 상대 시간 라벨 — 방금 / N분 전 / N시간 전 / N일 전. */
export function relativeLabel(at: string, nowIso: string): string {
  const diffMin = Math.floor((new Date(nowIso).getTime() - new Date(at).getTime()) / 60000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  const h = Math.floor(diffMin / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}
