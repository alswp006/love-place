// 일정 시각 빌드 + 검증 — 순수 함수(테스트로 못박음).
// 벽시계(입력 tz 기준)→ISO. tz는 IANA 식별자(기본 DISPLAY_TZ=Asia/Seoul). DST/지역 오프셋을 그 날짜에
// 맞춰 계산하므로 EventSheet 표시 경로(evTz 스루)와 저장 경로가 대칭이다 — 비-DISPLAY_TZ 이벤트를
// 수정·저장해도 무음 드리프트(LWW 금지, CLAUDE.md §4)가 발생하지 않는다.
// end<=start면 자정 넘김으로 보고 end를 다음날로 롤(종일 아님). 0길이/역전 범위는 거부(ok:false).
// DB CHECK("end">=start)는 백스톱.
import { DISPLAY_TZ } from './eventDays'

export type BuildEventTimesInput = {
  date: string // 'YYYY-MM-DD' 시작일(또는 종일 시작)
  allDay: boolean
  startTime?: string // 'HH:mm' (allDay=false)
  endTime?: string // 'HH:mm' (allDay=false)
  endDate?: string // 'YYYY-MM-DD' 종일 다일 종료일(없으면 date와 동일)
  timeZone?: string // IANA tz — 벽시계 해석 기준(기본 DISPLAY_TZ). 표시 evTz와 동일 값을 넘긴다.
}
export type BuildEventTimesResult =
  | { ok: true; start: string; end: string }
  | { ok: false; reason: 'same' | 'range' | 'missing' }

/** 주어진 IANA tz가 해당 벽시계 시점에 UTC보다 몇 분 앞서는지(동→양수). DST/지역 규칙을 그 시점 기준으로 반영. */
function tzOffsetMinutes(tz: string, date: string, time: string): number {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const asUTC = Date.UTC(y!, (mo ?? 1) - 1, d!, h ?? 0, mi ?? 0, 0)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(asUTC))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0')
  const hr = get('hour') === 24 ? 0 : get('hour') // Intl는 자정을 '24'로 줄 수 있음
  const localAsUTC = Date.UTC(get('year'), get('month') - 1, get('day'), hr, get('minute'), get('second'))
  return (localAsUTC - asUTC) / 60000
}

function iso(date: string, time: string, tz: string): string {
  const off = tzOffsetMinutes(tz, date, time)
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const ms = Date.UTC(y!, (mo ?? 1) - 1, d!, h ?? 0, mi ?? 0, 0) - off * 60000
  return new Date(ms).toISOString()
}
/**
 * 시작 시각을 옮길 때 종료가 따라오게 한다 — 길이(분)를 보존.
 *
 * 왜 필요한가: end<=start면 자정 넘김으로 해석하는 규칙(위 주석) 때문에, 시작을 13:00으로
 * 바꾸고 종료(11:00)를 그대로 두면 **경고 없이 22시간짜리 일정**이 저장됐다. 사용자는
 * '시작만 옮겼다'고 생각하는데 결과가 조용히 달라지는 게 문제다.
 * 자정 넘김 자체는 유효한 입력이므로(예: 23:00~01:00) 규칙을 없애지 않고,
 * 시작을 움직일 때 종료를 같은 간격만큼 끌고 가서 '의도치 않은' 넘김만 막는다.
 *
 * 종료를 사용자가 직접 만지는 경우엔 이 함수를 쓰지 않는다(그건 명시적 의도).
 */
export function followEndTime(prevStart: string, nextStart: string, end: string): string {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return (h ?? 0) * 60 + (m ?? 0)
  }
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  const prevS = toMin(prevStart)
  const nextS = toMin(nextStart)
  const e = toMin(end)
  // 원래 길이(자정 넘김이었으면 그 길이를 그대로 유지).
  const durationMin = e >= prevS ? e - prevS : 24 * 60 - prevS + e
  const nextEnd = (nextS + durationMin) % (24 * 60)
  return `${p(Math.floor(nextEnd / 60))}:${p(nextEnd % 60)}`
}

function addDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(Date.UTC(y!, (m ?? 1) - 1, d! + 1))
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`
}

export function buildEventTimes(input: BuildEventTimesInput): BuildEventTimesResult {
  const tz = input.timeZone || DISPLAY_TZ
  if (input.allDay) {
    const endKey = input.endDate && input.endDate.trim() ? input.endDate : input.date
    if (endKey < input.date) return { ok: false, reason: 'range' }
    return { ok: true, start: iso(input.date, '00:00', tz), end: iso(endKey, '23:59', tz) }
  }
  const st = input.startTime
  const et = input.endTime
  if (!st || !et) return { ok: false, reason: 'missing' }
  if (st === et) return { ok: false, reason: 'same' }
  const start = iso(input.date, st, tz)
  // end<=start면 자정 넘김 → 종료를 다음날 같은 시각으로
  const endSameDay = iso(input.date, et, tz)
  const end = endSameDay <= start ? iso(addDayKey(input.date), et, tz) : endSameDay
  return { ok: true, start, end }
}
