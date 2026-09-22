// 반복 일정(RRULE) — 설계서 §4.2/§5.1. 순수 함수(테스트로 못박음).
// 단순화 RRULE: FREQ(DAILY/WEEKLY/MONTHLY)·INTERVAL·BYDAY·BYMONTHDAY·COUNT·UNTIL·EXDATE 지원.
// (RECURRENCE-ID 회차별 오버라이드는 후속 — v1은 시리즈 편집 모델.)
//
// BYDAY·BYMONTHDAY (2026-09): '매주'는 "7일마다"가 아니라 **"무슨 요일마다"**, '매월'은
// **"몇 일마다"**다. 사람은 '화·목 운동'이라고 생각하지 '9/23부터 7일마다'라고 생각하지 않는다.
//
// ⚠️ 이 파일은 Flutter 앱 `app/lib/calendar/rrule.dart`와 **같은 규칙 문자열을 읽고 쓴다**
//    (같은 행을 두 앱이 본다). 해석이 갈리면 같은 일정이 두 앱에서 다른 날에 뜬다.
//    한쪽만 고치지 말 것 — 필드 순서(FREQ;INTERVAL;BYDAY;BYMONTHDAY;COUNT;UNTIL;EXDATE)까지 같다.
import { dayKey } from './eventDays'

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY'
export type ParsedRule = {
  freq: Freq
  interval: number
  /** 반복할 요일(0=일 … 6=토), 달력 순서·중복 없음. WEEKLY에서만 쓴다.
   *  비어 있으면 예전처럼 "시작일로부터 7·interval일마다". */
  byDay: number[]
  /** 반복할 날짜(1~31). MONTHLY에서만. 없으면 예전처럼 시작일의 일(日)을 따른다. */
  byMonthDay?: number
  count?: number
  until?: string // ISO
  exdates: string[] // 제외할 날짜키 'YYYY-MM-DD'
}

/** RFC 요일 토큰 — 달력 순서(일요일 먼저). 그리드가 일요일로 시작하므로 규칙도 같은 순서. */
const WEEKDAY_TOKENS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

/** 'MO,WE' → [1, 3]. 모르는 토큰(·RFC 서수 '2MO')은 버린다 — 깨진 규칙이 캘린더를 멈추지 않게. */
export function parseByDay(raw: string | undefined): number[] {
  if (!raw) return []
  const picked = new Set<number>()
  for (const t of raw.split(',')) {
    const i = WEEKDAY_TOKENS.indexOf(t.trim().toUpperCase() as (typeof WEEKDAY_TOKENS)[number])
    if (i >= 0) picked.add(i)
  }
  return [...picked].sort((a, b) => a - b)
}

/** [3, 1] → 'MO,WE'. 비면 undefined(필드 자체를 안 쓴다). */
export function byDayToWire(days: number[] | undefined): string | undefined {
  if (!days || days.length === 0) return undefined
  const sorted = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
  return sorted.length === 0 ? undefined : sorted.map((d) => WEEKDAY_TOKENS[d]).join(',')
}

export function parseRule(text: string | null | undefined): ParsedRule | null {
  if (!text) return null
  const map: Record<string, string> = {}
  for (const part of text.split(';')) {
    const [k, v] = part.split('=')
    if (k && v) map[k.trim().toUpperCase()] = v.trim()
  }
  const freq = map.FREQ
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') return null
  const rule: ParsedRule = {
    freq,
    interval: Math.max(1, Number(map.INTERVAL ?? '1') || 1),
    byDay: parseByDay(map.BYDAY),
    exdates: [],
  }
  // 음수(RFC의 '말일에서 거꾸로')는 지원하지 않는다 — 화면에 그 선택지가 없다.
  const md = Number(map.BYMONTHDAY?.split(',')[0])
  if (Number.isInteger(md) && md >= 1 && md <= 31) rule.byMonthDay = md
  if (map.COUNT) rule.count = Math.max(1, Number(map.COUNT) || 1)
  if (map.UNTIL) rule.until = map.UNTIL
  if (map.EXDATE) rule.exdates = map.EXDATE.split(',').map((s) => s.trim()).filter(Boolean)
  return rule
}

/** 필드 순서는 Flutter판과 같게 **고정**이다 — 같은 규칙이 두 앱에서 같은 문자열이어야
 *  낙관적 락의 헛 충돌과 "상대가 방금 뭘 바꿨지?" 오탐이 없다. BY*가 없는 기존 행은
 *  문자열이 한 글자도 안 바뀐다. 안 맞는 조합(DAILY+BYDAY 등)은 여기서 떨군다. */
export function buildRule(
  freq: Freq,
  interval: number,
  count?: number,
  exdates?: string[],
  until?: string,
  byDay?: number[],
  byMonthDay?: number,
): string {
  let s = `FREQ=${freq};INTERVAL=${Math.max(1, interval)}`
  const days = freq === 'WEEKLY' ? byDayToWire(byDay) : undefined
  if (days) s += `;BYDAY=${days}`
  if (freq === 'MONTHLY' && byMonthDay && byMonthDay >= 1 && byMonthDay <= 31) {
    s += `;BYMONTHDAY=${byMonthDay}`
  }
  if (count && count > 0) s += `;COUNT=${count}`
  if (until) s += `;UNTIL=${until}`
  if (exdates && exdates.length > 0) s += `;EXDATE=${exdates.join(',')}`
  return s
}

function advance(d: Date, freq: Freq, interval: number): Date {
  const n = new Date(d)
  if (freq === 'DAILY') n.setUTCDate(n.getUTCDate() + interval)
  else if (freq === 'WEEKLY') n.setUTCDate(n.getUTCDate() + 7 * interval)
  else n.setUTCMonth(n.getUTCMonth() + interval)
  return n
}

/** start(ISO)부터 규칙대로 전개해 [winStart,winEnd] 안의 occurrence 시작 ISO 배열. COUNT/UNTIL/EXDATE 적용. */
export function expandOccurrences(
  startIso: string,
  rule: ParsedRule,
  winStartIso: string,
  winEndIso: string,
): string[] {
  const out: string[] = []
  const winStart = new Date(winStartIso).getTime()
  const winEnd = new Date(winEndIso).getTime()
  const until = rule.until ? new Date(rule.until).getTime() : Infinity
  const maxCount = rule.count ?? 10000
  const exset = new Set(rule.exdates)

  let i = 0
  for (const occ of occurrenceStream(new Date(startIso), rule)) {
    if (i++ >= Math.min(maxCount, 3000)) break
    const t = occ.getTime()
    if (t > until || t > winEnd) break
    if (t >= winStart && !exset.has(dayKey(occ.toISOString()))) {
      out.push(occ.toISOString())
    }
  }
  return out
}

/** 표시 타임존 기준 날짜 조각 — dayKey가 이미 tz 변환을 하므로 그 결과를 쪼갠다. */
function displayDate(d: Date): { y: number; m: number; day: number; weekday: number } {
  const [y, m, day] = dayKey(d.toISOString()).split('-').map(Number) as [number, number, number]
  // UTC 달력으로 요일만 뽑는다(같은 Y-M-D면 요일은 tz와 무관).
  return { y, m, day, weekday: new Date(Date.UTC(y, m - 1, day)).getUTCDay() }
}

const DAY_MS = 86400000

/** 회차 시작 시각을 이른 순서대로 낸다. COUNT·UNTIL·윈도우는 호출자가 자른다.
 *
 *  세 갈래: BY*가 없으면 예전 그대로 advance()로(기존 행의 동작을 한 톨도 안 바꾼다),
 *  WEEKLY+BYDAY면 interval주마다 그 주의 선택 요일들을, MONTHLY+BYMONTHDAY면
 *  interval달마다 그 날짜를.
 *
 *  날짜 산술을 표시 tz 달력으로 하고 결과는 시작 시각에 **일(日)만** 더해 만든다.
 *  서울은 서머타임이 없어 'UTC로 N일'과 '표시 tz로 N일'이 언제나 같다 — 시:분이 안 흔들린다.
 *  (Flutter판 `_occurrenceStream`과 같은 알고리즘. 한쪽만 고치지 말 것.) */
function* occurrenceStream(start: Date, rule: ParsedRule): Generator<Date> {
  const byDay = rule.freq === 'WEEKLY' ? rule.byDay : []
  const byMonthDay = rule.freq === 'MONTHLY' ? rule.byMonthDay : undefined

  if (byDay.length === 0 && byMonthDay === undefined) {
    let occ = start
    for (let i = 0; i < 3000; i++) {
      yield occ
      occ = advance(occ, rule.freq, rule.interval)
    }
    return
  }

  const disp = displayDate(start)

  if (byDay.length > 0) {
    const cols = [...byDay].sort((a, b) => a - b)
    for (let w = 0; w * cols.length < 3000; w++) {
      for (const c of cols) {
        const off = w * 7 * rule.interval + (c - disp.weekday)
        // 시작일 그 주에서 시작일보다 앞선 요일은 건너뛴다 — 제 시작보다 먼저 시작할 수 없다.
        if (off < 0) continue
        yield new Date(start.getTime() + off * DAY_MS)
      }
    }
    return
  }

  const anchor = Date.UTC(disp.y, disp.m - 1, disp.day)
  for (let m = 0; m < 3000 * rule.interval; m += rule.interval) {
    const first = new Date(Date.UTC(disp.y, disp.m - 1 + m, 1))
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
    // 그 달에 없는 날짜(2월 31일)는 건너뛴다. 3월 3일로 밀지 않는다.
    if ((byMonthDay as number) > lastDay) continue
    const target = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), byMonthDay as number)
    const off = Math.round((target - anchor) / DAY_MS)
    if (off < 0) continue // 시작일이 든 달에서 시작일보다 이른 날짜
    yield new Date(start.getTime() + off * DAY_MS)
  }
}

export type Occurrence<T> = T & { _seriesStart: string; _seriesEnd: string }

/** 이벤트들을 [winStart,winEnd] 윈도우의 표시용 occurrence로 전개.
 *  반복이면 여러 개로, 아니면 윈도우 안일 때 1개. start/end는 occurrence 시각, _seriesStart/End는 시리즈 원본(편집용). */
export function expandEvents<
  T extends { id: string; start: string; end: string; recurrence_rule?: string | null },
>(events: T[], winStartIso: string, winEndIso: string): Occurrence<T>[] {
  const out: Occurrence<T>[] = []
  for (const e of events) {
    const rule = parseRule(e.recurrence_rule)
    if (!rule) {
      if (e.start >= winStartIso && e.start <= winEndIso) {
        out.push({ ...e, _seriesStart: e.start, _seriesEnd: e.end })
      }
      continue
    }
    const durMs = new Date(e.end).getTime() - new Date(e.start).getTime()
    for (const occStart of expandOccurrences(e.start, rule, winStartIso, winEndIso)) {
      const occEnd = new Date(new Date(occStart).getTime() + durMs).toISOString()
      out.push({ ...e, start: occStart, end: occEnd, _seriesStart: e.start, _seriesEnd: e.end })
    }
  }
  return out
}
