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

/** 칸의 농도 0~4. 색만으로 구분하지 않으므로(§8) UI는 이 단계에 모양도 함께 바꾼다. */
export function levelOf(total: number): 0 | 1 | 2 | 3 | 4 {
  if (total <= 0) return 0
  if (total === 1) return 1
  if (total === 2) return 2
  if (total === 3) return 3
  return 4
}

/** 그 칸의 주인 — 가장 많은 쪽. 동수면 '함께'로 본다(둘이 쓰는 앱의 기본값은 공유다). */
export function ownerOf(cell: DayCell): 'mine' | 'partner' | 'shared' | 'none' {
  if (cell.total === 0) return 'none'
  const max = Math.max(cell.mine, cell.partner, cell.shared)
  const tied = [cell.mine === max, cell.partner === max, cell.shared === max].filter(Boolean).length
  if (tied > 1) return 'shared'
  if (cell.shared === max) return 'shared'
  if (cell.mine === max) return 'mine'
  return 'partner'
}

/**
 * 12주 격자 — 오늘이 마지막 열에 오게 주 단위로 자른다.
 * 반환은 열(주) 배열이고 각 열은 월~일 7칸. 미래 칸도 자리를 지킨다(빈칸) —
 * 이번 주만 짧게 그리면 격자가 들쭉날쭉해 보인다.
 */
export function gardenGrid(
  counts: ReadonlyMap<string, DayCell>,
  todayKey: string,
  weeks = 12,
): DayCell[][] {
  // 오늘이 속한 주의 월요일부터 역산.
  const dow = (key: string): number => {
    const [y, m, d] = key.split('-').map(Number)
    const wd = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay()
    return (wd + 6) % 7 // 월=0 … 일=6
  }
  const thisMonday = addDays(todayKey, -dow(todayKey))
  const firstMonday = addDays(thisMonday, -(weeks - 1) * 7)
  const cols: DayCell[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: DayCell[] = []
    for (let d = 0; d < 7; d++) {
      const key = addDays(firstMonday, w * 7 + d)
      col.push(counts.get(key) ?? { key, total: 0, mine: 0, partner: 0, shared: 0 })
    }
    cols.push(col)
  }
  return cols
}

// ── 여정 ────────────────────────────────────────────────────────────────────
// 완료 1건 = 한 걸음. STEPS_PER_STATION 걸음마다 정거장 하나를 지난다.
// 숫자(연속 N일)를 주인공으로 두지 않는 이유: 끊기면 0으로 떨어져 벌처럼 느껴진다.
// 여정은 뒤로 가지 않는다 — 쉬어도 걸어온 길은 남는다.

export const STEPS_PER_STATION = 10

/** 정거장 — 여행 앱답게 '가본 곳'의 결로. 순환하므로 끝나지 않는다. */
export const STATIONS = [
  { key: 'cafe', label: '카페' },
  { key: 'beach', label: '해변' },
  { key: 'mountain', label: '전망대' },
  { key: 'tent', label: '캠핑장' },
  { key: 'ferris', label: '놀이공원' },
] as const

export type StationKey = (typeof STATIONS)[number]['key']

export type JourneyProgress = {
  /** 총 걸음(=총 완료 수). */
  steps: number
  /** 지나온 정거장 수. */
  stationsPassed: number
  /** 직전 정거장(출발점)과 다음 정거장. */
  from: (typeof STATIONS)[number]
  to: (typeof STATIONS)[number]
  /** 이번 구간에서 걸은 칸 0…STEPS_PER_STATION-1. */
  stepInLeg: number
  /** 다음 정거장까지 남은 걸음. */
  remaining: number
  /** 이번 구간 진행도 0~1 — 캐릭터를 길 위 어디에 놓을지. */
  ratio: number
}

export function journeyProgress(steps: number): JourneyProgress {
  const safe = Math.max(0, Math.floor(steps))
  const stationsPassed = Math.floor(safe / STEPS_PER_STATION)
  const stepInLeg = safe % STEPS_PER_STATION
  const fromIdx = stationsPassed % STATIONS.length
  const toIdx = (stationsPassed + 1) % STATIONS.length
  return {
    steps: safe,
    stationsPassed,
    from: STATIONS[fromIdx]!,
    to: STATIONS[toIdx]!,
    stepInLeg,
    remaining: STEPS_PER_STATION - stepInLeg,
    ratio: stepInLeg / STEPS_PER_STATION,
  }
}

/** 이번 주(월~오늘) 완료 수 — 접힌 줄에 보여줄 한 개의 숫자. */
export function weekDoneCount(counts: ReadonlyMap<string, DayCell>, todayKey: string): number {
  const [y, m, d] = todayKey.split('-').map(Number)
  const wd = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay()
  const monday = addDays(todayKey, -((wd + 6) % 7))
  let n = 0
  for (let i = 0; i < 7; i++) {
    const key = addDays(monday, i)
    if (key > todayKey) break
    n += counts.get(key)?.total ?? 0
  }
  return n
}
