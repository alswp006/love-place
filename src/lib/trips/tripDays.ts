import {
  DISPLAY_TZ,
  dayKey,
  diffDays,
  minuteOfDay,
  pad2,
  ymdKey,
  type DayGroupable,
} from '@/lib/calendar/eventDays'

// 여행 Day 도출 — 순수 함수(테스트로 못박음).
// 핵심 계약: 여행에 담긴 계획을 따로 저장하지 않는다(CLAUDE.md §7 "상태는 도출, 저장 아님").
//   여행의 Day N 스톱 = 그 날짜에 든 events 중 place_id가 있는 것.
// 그래서 events↔trips 조인 테이블도, events.trip_id 컬럼도 필요 없다(마이그레이션 0).
// 캘린더(시간 축)와 여행(여행 축)이 같은 events를 서로 다른 렌즈로 볼 뿐이라 불일치가 생길 수 없다.

export type TripLike = { start_date: string; end_date: string }

/** 여행 기간 안의 하루 슬롯. index는 1-based(화면의 "Day 1"). */
export type TripDay = { key: string; index: number }

/** 날짜 키에 일수 가감. UTC 산술이라 로컬 tz·DST에 흔들리지 않는다. */
export function addDays(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + delta))
  return ymdKey(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
}

/**
 * 여행 기간 → Day 슬롯 목록.
 * end < start(잘못된 행)면 빈 배열. maxDays는 폭주 방어 상한 — 넘으면 잘라내고 UI가 그만큼만 그린다.
 */
export function tripDays(trip: TripLike, maxDays = 60): TripDay[] {
  const span = diffDays(trip.start_date, trip.end_date)
  if (!Number.isFinite(span) || span < 0) return []
  const count = Math.min(span + 1, maxDays)
  const days: TripDay[] = []
  for (let i = 0; i < count; i++) days.push({ key: addDays(trip.start_date, i), index: i + 1 })
  return days
}

/** 오늘 기준 여행이 어느 국면인지. 색이 아니라 이 값에서 나온 '텍스트 라벨'로 구분한다(§8 이중화). */
export type TripPhase = 'ONGOING' | 'UPCOMING' | 'PAST'

export function tripPhase(trip: TripLike, todayKey: string): TripPhase {
  if (todayKey < trip.start_date) return 'UPCOMING'
  if (todayKey > trip.end_date) return 'PAST'
  return 'ONGOING'
}

/** 목록 칩에 쓸 라벨. 진행중은 'D-'가 의미 없으므로 '여행 중'. */
export function tripPhaseLabel(trip: TripLike, todayKey: string): string {
  const phase = tripPhase(trip, todayKey)
  if (phase === 'ONGOING') return '여행 중'
  if (phase === 'UPCOMING') {
    const d = diffDays(todayKey, trip.start_date)
    return d === 1 ? '내일 출발' : `D-${d}`
  }
  const d = diffDays(trip.end_date, todayKey)
  return d === 1 ? '어제' : `${d}일 전`
}

const PHASE_ORDER: Record<TripPhase, number> = { ONGOING: 0, UPCOMING: 1, PAST: 2 }

/**
 * 목록 정렬: 진행중 → 예정(임박한 순) → 지난(최근 순).
 * 지금 무엇을 하고 있는지가 맨 위에 오게 한다(설정 탭에 묻혀 있던 목록을 승격하는 이유).
 * 원본 배열을 건드리지 않는다(호출부가 TanStack Query 캐시 배열을 넘겨도 안전).
 */
export function sortTripsForList<T extends TripLike>(trips: readonly T[], todayKey: string): T[] {
  return [...trips].sort((a, b) => {
    const pa = tripPhase(a, todayKey)
    const pb = tripPhase(b, todayKey)
    if (pa !== pb) return PHASE_ORDER[pa] - PHASE_ORDER[pb]
    // 예정은 가까운 것부터, 진행중·지난은 최근 것부터.
    return pa === 'UPCOMING'
      ? a.start_date.localeCompare(b.start_date)
      : b.start_date.localeCompare(a.start_date)
  })
}

/** 여행 스톱이 될 수 있는 이벤트 — 장소가 연결된 것만. */
export type StopLike = DayGroupable & { place_id: string | null }

/**
 * 그 날의 스톱 = 해당 날짜 버킷의 이벤트 중 place_id가 있는 것, 시작시각 순.
 * 장소 없는 일정(예: "휴가 신청")은 캘린더엔 남되 여행 동선에는 끼지 않는다.
 */
export function stopsOfDay<T extends StopLike>(
  events: readonly T[],
  day: string,
  tz: string = DISPLAY_TZ,
): T[] {
  return events
    .filter((e) => e.place_id !== null && dayKey(e.start, tz) === day)
    .sort((a, b) => a.start.localeCompare(b.start))
}

// ── 새 스톱을 담을 시각 ───────────────────────────────────────────────────────
// 표시 tz 고정(+09:00) — coursePlan과 같은 규칙이라 AI 코스로 만든 이벤트와 손으로 담은 이벤트가 같은 축에 선다.

const TZ_OFFSET = '+09:00'
/** 기본 첫 스톱 10:00. */
export const DEFAULT_FIRST_STOP_MIN = 10 * 60
/** 새 스톱이 자정을 넘겨 다음 날로 새지 않게 하는 상한(22:00). */
export const MAX_STOP_START_MIN = 22 * 60

/** 'YYYY-MM-DD' + 자정으로부터의 분 → ISO(UTC). 분은 [0, 23:59]로 클램프. */
export function slotIso(day: string, minutes: number): string {
  const clamped = Math.max(0, Math.min(Math.round(minutes), 23 * 60 + 59))
  return new Date(
    `${day}T${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}:00${TZ_OFFSET}`,
  ).toISOString()
}

/**
 * 그 날에 스톱을 하나 더 담을 때의 시작 분 — 마지막 스톱 끝에 이어붙인다.
 * 비어 있으면 기본(10:00). 마지막 스톱이 자정을 넘겼거나 늦으면 상한(22:00)으로 눌러
 * 새 스톱이 다음 날짜 버킷으로 새지 않게 한다.
 */
export function nextStopStartMin<T extends { end: string }>(
  stops: readonly T[],
  day: string,
  tz: string = DISPLAY_TZ,
): number {
  const last = stops[stops.length - 1]
  if (!last) return DEFAULT_FIRST_STOP_MIN
  if (dayKey(last.end, tz) !== day) return MAX_STOP_START_MIN
  return Math.min(minuteOfDay(last.end, tz), MAX_STOP_START_MIN)
}

/** 여행 기간 전체에 걸친 스톱 수(목록 카드의 "N곳" 표기용). */
export function stopCountInTrip<T extends StopLike>(
  events: readonly T[],
  trip: TripLike,
  tz: string = DISPLAY_TZ,
): number {
  return events.filter((e) => {
    if (e.place_id === null) return false
    const k = dayKey(e.start, tz)
    return trip.start_date <= k && k <= trip.end_date
  }).length
}
