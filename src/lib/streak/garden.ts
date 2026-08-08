import { DISPLAY_TZ, dayKey, pad2 } from '@/lib/calendar/eventDays'
import { starsNeededForMonth } from './constellations'

// 잔디 · 여정 도출 — 순수 함수(테스트로 못박음).
//
// 집계 테이블이 없다(CLAUDE.md §7): 잔디 한 칸은 그 날짜의 완료 기록 수(event_completions),
// 여정 한 걸음은 완료 1건이다. 체크를 풀면 잔디도 같이 줄어든다 — 불일치가 생길 자리가 없다.
//
// 완료 기록은 회차(occurrence)를 가리킬 뿐이므로, 칸의 색·카테고리는 그 회차가 속한
// events 행에서 도출한다(캘린더 트랙과 같은 규칙, §4.2):
//   SHARED = 함께(보라) / PERSONAL & 내 것 = 나(민트) / PERSONAL & 상대 것 = 상대(핑크)

/** 완료 기록 — event_completions 행에서 필요한 것만. */
export type CompletionLike = { event_id: string; done_at: string; created_by: string }

/**
 * 별의 주인 — '함께'는 없다. 별은 하루에 사람마다 하나이므로 **누가 체크했나**로만 갈린다
 * (함께 일정을 내가 체크하면 내 별이다). 색은 캘린더 트랙의 나/상대와 같은 축.
 */
export type StarOwner = 'mine' | 'partner'

/** 완료가 가리키는 일정의 메타 — 색·카테고리를 정한다. */
export type EventMeta = {
  owner_id: string
  visibility: 'SHARED' | 'PERSONAL'
  category_id: string | null
}

/** 별 하나 = 그 사람이 그 날 처음 챙긴 일. 무엇이었는지까지 들고 있어야 눌러 되짚을 수 있다. */
export type StarEntry = {
  eventId: string
  /** 체크한 사람 — 하루 한 사람 한 별의 기준이다. */
  userId: string
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
    const cell = map.get(key) ?? { key, total: 0, mine: 0, partner: 0, entries: [] }
    // 별의 주인은 일정 소유자가 아니라 **체크한 사람**이다(함께 일정을 내가 끝내면 내 별).
    const owner: StarOwner = myId && c.created_by === myId ? 'mine' : 'partner'
    cell.total += 1
    if (owner === 'mine') cell.mine += 1
    else cell.partner += 1
    cell.entries.push({
      eventId: c.event_id,
      userId: c.created_by,
      owner,
      dayKey: key,
      doneAt: c.done_at,
    })
    map.set(key, cell)
  }
  return map
}

// ── 별자리 ──────────────────────────────────────────────────────────────────
// 한 달 = 별자리 하나. 채워야 할 별은 **그 달의 날 수 × 2명**이다(8월이면 62개).
//
// 하루에 한 사람이 채울 수 있는 별은 하나다. 그 날 일정을 열 개 끝냈든 하나 끝냈든 별은 하나 —
// 그래야 별자리가 "며칠이나 챙겼나"의 기록이 된다. 개수 경쟁이 되면 하루에 몰아치고
// 나머지 날을 비우는 게 유리해지는데, 그건 이 기능이 응원하려던 것과 정반대다.
//
// 별자리는 그 달에 실제로 보이는 것에서 온다(constellations.ts) — 지어낸 모양·이름이 아니다.

/** 'YYYY-MM' — 그 날이 속한 달. */
export function monthOf(dayKeyStr: string): string {
  return dayKeyStr.slice(0, 7)
}

/**
 * 한 달의 별들 — 사람마다 하루 하나까지.
 *
 * 같은 사람이 같은 날 여러 번 체크했으면 **가장 먼저 체크한 것**이 그 별이 된다
 * (그 날 처음 챙긴 순간이 기록이다). 정렬은 체크한 순서.
 */
export function monthStars(
  counts: ReadonlyMap<string, DayCell>,
  monthKey: string,
): StarEntry[] {
  const first = new Map<string, StarEntry>()
  for (const [dayKeyStr, cell] of counts) {
    if (!dayKeyStr.startsWith(monthKey)) continue
    for (const e of cell.entries) {
      const slot = `${e.userId}|${e.dayKey}`
      const prev = first.get(slot)
      if (!prev || e.doneAt < prev.doneAt) first.set(slot, e)
    }
  }
  return [...first.values()].sort((a, b) => a.doneAt.localeCompare(b.doneAt))
}

export type MonthSummary = {
  monthKey: string
  stars: StarEntry[]
  /** 그 달을 다 채우는 데 필요한 별 수(날 수 × 2). */
  needed: number
  complete: boolean
}

/** 최근 n개월(이번 달이 마지막). */
export function recentMonths(
  counts: ReadonlyMap<string, DayCell>,
  todayKey: string,
  months = 6,
): MonthSummary[] {
  const [y, m] = todayKey.split('-').map(Number)
  const out: MonthSummary[] = []
  for (let k = months - 1; k >= 0; k--) {
    const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 - k, 1))
    const monthKey = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`
    const stars = monthStars(counts, monthKey)
    const needed = starsNeededForMonth(monthKey)
    out.push({ monthKey, stars, needed, complete: stars.length >= needed })
  }
  return out
}

/** 오늘 내가/상대가 이미 별을 채웠는지 — "오늘은 채웠어요"를 말해주기 위한 것. */
export function filledToday(
  counts: ReadonlyMap<string, DayCell>,
  todayKey: string,
): { mine: boolean; partner: boolean } {
  const cell = counts.get(todayKey)
  return {
    mine: Boolean(cell?.entries.some((e) => e.owner === 'mine')),
    partner: Boolean(cell?.entries.some((e) => e.owner === 'partner')),
  }
}
