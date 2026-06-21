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
