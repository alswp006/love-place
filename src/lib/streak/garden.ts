import { DISPLAY_TZ, dayKey } from '@/lib/calendar/eventDays'
import { addDays } from '@/lib/trips/tripDays'
import { constellationOfWeek } from './constellations'

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

export type StarOwner = 'mine' | 'partner' | 'shared'

/** 완료가 가리키는 일정의 메타 — 색·카테고리를 정한다. */
export type EventMeta = {
  owner_id: string
  visibility: 'SHARED' | 'PERSONAL'
  category_id: string | null
}

/** 별 하나 = 완료 기록 하나. 무엇을 한 건지까지 들고 있어야 별을 눌러 되짚을 수 있다. */
export type StarEntry = {
  eventId: string
  owner: StarOwner
  dayKey: string
  doneAt: string
}

export type DayCell = {
  key: string
  /** 그 날 완료 총합. */
  total: number
  mine: number
  partner: number
  shared: number
  entries: StarEntry[]
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
    const cell = map.get(key) ?? { key, total: 0, mine: 0, partner: 0, shared: 0, entries: [] }
    const owner: StarOwner =
      e.visibility === 'SHARED' ? 'shared' : myId && e.owner_id === myId ? 'mine' : 'partner'
    cell.total += 1
    if (owner === 'shared') cell.shared += 1
    else if (owner === 'mine') cell.mine += 1
    else cell.partner += 1
    cell.entries.push({ eventId: c.event_id, owner, dayKey: key, doneAt: c.done_at })
    map.set(key, cell)
  }
  return map
}

// ── 별자리 ──────────────────────────────────────────────────────────────────
// 완료 1건 = 별 하나. 그 주에 배정된 **실제 별자리**의 별을 다 채우면 완성이다.
//
// 별자리는 그 달에 실제로 보이는 것 중에서 고른다(constellations.ts) — 지어낸 모양·이름이
// 아니라서 "지금 하늘에 있는 걸 채운다"는 말이 참이 된다. 별 개수도 별자리마다 다르다
// (카시오페이아 5, 북두칠성 7, 전갈자리 8) — 주마다 목표가 달라지는 게 오히려 리듬이 된다.
//
// 주 단위로 간 이유: 캘린더가 이미 주로 끊겨 있어 "이번 주"가 화면 어디서나 같은 뜻이 된다.

/** 그 주 월요일 키. */
export function mondayOf(dayKeyStr: string): string {
  const [y, m, d] = dayKeyStr.split('-').map(Number)
  const wd = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay()
  return addDays(dayKeyStr, -((wd + 6) % 7))
}

/**
 * 한 주의 별들 — 실제로 체크한 순서(done_at)대로.
 * 앞서는 같은 날 안에서 함께→나→상대로 임의 정렬했는데, 체크한 순서가 진짜 순서다.
 */
export function weekStars(
  counts: ReadonlyMap<string, DayCell>,
  mondayKey: string,
): StarEntry[] {
  const out: StarEntry[] = []
  for (let i = 0; i < 7; i++) {
    const cell = counts.get(addDays(mondayKey, i))
    if (cell) out.push(...cell.entries)
  }
  return out.sort((a, b) => a.doneAt.localeCompare(b.doneAt))
}

export type WeekSummary = {
  mondayKey: string
  stars: StarEntry[]
  /** 그 주 별자리가 요구하는 별 수. */
  needed: number
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
    const needed = constellationOfWeek(mondayKey).points.length
    out.push({ mondayKey, stars, needed, complete: stars.length >= needed })
  }
  return out
}
