import { DISPLAY_TZ, dayKey } from '@/lib/calendar/eventDays'
import { addDays } from '@/lib/trips/tripDays'

// 잔디 · 여정 도출 — 순수 함수(테스트로 못박음).
//
// 집계 테이블이 없다(CLAUDE.md §7): 잔디 한 칸은 그 날짜의 완료 기록 수(event_completions),
// 여정 한 걸음은 완료 1건이다. 체크를 풀면 잔디도 같이 줄어든다 — 불일치가 생길 자리가 없다.
//
// 완료 기록은 회차(occurrence)를 가리킬 뿐이므로, 칸의 색·카테고리는 그 회차가 속한
// events 행에서 도출한다(캘린더 트랙과 같은 규칙, §4.2):
//   SHARED = 함께(보라) / PERSONAL & 내 것 = 나(민트) / PERSONAL & 상대 것 = 상대(핑크)

/** 완료 기록 — event_completions 행에서 필요한 것만. */
export type CompletionLike = { event_id: string; done_at: string }

/** 완료가 가리키는 일정의 메타 — 색·카테고리를 정한다. */
export type EventMeta = {
  owner_id: string
  visibility: 'SHARED' | 'PERSONAL'
  category_id: string | null
}

export type DayCell = {
  key: string
  /** 그 날 완료 총합 — 칸의 농도를 정한다. */
  total: number
  mine: number
  partner: number
  shared: number
}

/**
 * 날짜별 완료 수. 완료 시각(done_at)이 아니라 **완료한 날**로 센다 —
 * 어젯밤 12시 넘어 체크했다고 오늘 칸이 차면 "언제 한 건지"가 어긋난다.
 * (done_at 자체가 체크한 시각이므로 그 시각의 날짜 버킷을 쓴다.)
 */
export function dailyDoneCounts(
  completions: readonly CompletionLike[],
  metaOf: (eventId: string) => EventMeta | undefined,
  myId: string | null,
  opts: { categoryId?: string | null; tz?: string } = {},
): Map<string, DayCell> {
  const tz = opts.tz ?? DISPLAY_TZ
  const map = new Map<string, DayCell>()
  for (const c of completions) {
    // 일정이 지워졌으면(soft-delete) 그 완료도 잔디에서 빠진다 — 없는 일을 했다고 하지 않는다.
    const e = metaOf(c.event_id)
    if (!e) continue
    // categoryId가 주어지면 그 카테고리만(전체 보기는 undefined를 넘긴다).
    if (opts.categoryId !== undefined && e.category_id !== opts.categoryId) continue
    const key = dayKey(c.done_at, tz)
    const cell = map.get(key) ?? { key, total: 0, mine: 0, partner: 0, shared: 0 }
    cell.total += 1
    if (e.visibility === 'SHARED') cell.shared += 1
    else if (myId && e.owner_id === myId) cell.mine += 1
    else cell.partner += 1
    map.set(key, cell)
  }
  return map
}

// ── 별자리 ──────────────────────────────────────────────────────────────────
// 완료 1건 = 별 하나. 한 주에 STARS_PER_WEEK개를 모으면 그 주의 별자리가 완성된다.
//
// 왜 주 단위인가: 캘린더가 이미 주로 끊겨 있다. 그 리듬을 그대로 쓰면 "이번 주"라는 단위가
// 화면 어디서나 같은 뜻이 된다. 달 단위는 너무 멀고, 일 단위는 서사가 안 생긴다.
//
// 정거장 은유(카페→해변)를 버린 이유: 우리 데이터와 아무 상관 없는 가짜 서사였다.
// 별자리는 "우리가 채운 만큼 하늘에 남는다"는 것 말고 다른 주장을 하지 않는다.

export const STARS_PER_WEEK = 7

export type StarOwner = 'mine' | 'partner' | 'shared'

/** 그 주 월요일 키. */
export function mondayOf(dayKeyStr: string): string {
  const [y, m, d] = dayKeyStr.split('-').map(Number)
  const wd = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay()
  return addDays(dayKeyStr, -((wd + 6) % 7))
}

/**
 * 한 주의 별들 — 날짜순으로 편 완료 기록.
 * 같은 날 안에서는 함께 → 나 → 상대 순으로 낸다(정렬 규칙이 있어야 별 위치가 안 흔들린다).
 */
export function weekStars(
  counts: ReadonlyMap<string, DayCell>,
  mondayKey: string,
): StarOwner[] {
  const out: StarOwner[] = []
  for (let i = 0; i < 7; i++) {
    const cell = counts.get(addDays(mondayKey, i))
    if (!cell) continue
    for (let n = 0; n < cell.shared; n++) out.push('shared')
    for (let n = 0; n < cell.mine; n++) out.push('mine')
    for (let n = 0; n < cell.partner; n++) out.push('partner')
  }
  return out
}

export type WeekSummary = {
  mondayKey: string
  stars: StarOwner[]
  /** 별자리가 완성됐나(STARS_PER_WEEK 이상). */
  complete: boolean
}

/** 최근 n주(오늘이 속한 주가 마지막). */
export function recentWeeks(
  counts: ReadonlyMap<string, DayCell>,
  todayKey: string,
  weeks = 12,
): WeekSummary[] {
  const thisMonday = mondayOf(todayKey)
  const out: WeekSummary[] = []
  for (let w = weeks - 1; w >= 0; w--) {
    const mondayKey = addDays(thisMonday, -w * 7)
    const stars = weekStars(counts, mondayKey)
    out.push({ mondayKey, stars, complete: stars.length >= STARS_PER_WEEK })
  }
  return out
}

/**
 * 주마다 다른 별자리 모양 — 주 키에서 결정론적으로 고른다.
 * 저장하지 않고 도출한다: 같은 주는 언제 열어도 같은 모양·같은 이름이다.
 */
export const CONSTELLATIONS = [
  { name: '돛단배', points: [[14, 46], [30, 30], [46, 14], [54, 34], [72, 30], [84, 46], [50, 52]] },
  { name: '리본', points: [[16, 24], [34, 40], [16, 54], [50, 40], [84, 24], [66, 40], [84, 54]] },
  { name: '작은곰', points: [[14, 50], [28, 40], [44, 44], [58, 34], [70, 22], [82, 32], [78, 48]] },
  { name: '나비', points: [[24, 22], [40, 38], [24, 54], [50, 38], [76, 22], [60, 38], [76, 54]] },
  { name: '왕관', points: [[14, 50], [26, 26], [38, 44], [50, 20], [62, 44], [74, 26], [86, 50]] },
  { name: '물결', points: [[12, 42], [26, 30], [40, 44], [54, 30], [68, 44], [82, 30], [92, 42]] },
] as const

/** 문자열 → 안정 해시(주 키에서 모양을 고르는 데만 쓴다). */
export function hashKey(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function constellationOf(mondayKey: string): (typeof CONSTELLATIONS)[number] {
  return CONSTELLATIONS[hashKey(mondayKey) % CONSTELLATIONS.length]!
}
