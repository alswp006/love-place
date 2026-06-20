// 일정 시각 빌드 + 검증 — 순수 함수(테스트로 못박음).
// Asia/Seoul 고정 오프셋(+09:00, DST 없음)으로 벽시계→ISO. end<=start면 자정 넘김으로 보고
// end를 다음날로 롤(종일 아님). 0길이/역전 범위는 거부(ok:false). DB CHECK("end">=start)는 백스톱.
export type BuildEventTimesInput = {
  date: string // 'YYYY-MM-DD' 시작일(또는 종일 시작)
  allDay: boolean
  startTime?: string // 'HH:mm' (allDay=false)
  endTime?: string // 'HH:mm' (allDay=false)
  endDate?: string // 'YYYY-MM-DD' 종일 다일 종료일(없으면 date와 동일)
}
export type BuildEventTimesResult =
  | { ok: true; start: string; end: string }
  | { ok: false; reason: 'same' | 'range' | 'missing' }

function iso(date: string, time: string): string {
  return new Date(`${date}T${time}:00+09:00`).toISOString()
}
function addDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(Date.UTC(y!, (m ?? 1) - 1, d! + 1))
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`
}

export function buildEventTimes(input: BuildEventTimesInput): BuildEventTimesResult {
  if (input.allDay) {
    const endKey = input.endDate && input.endDate.trim() ? input.endDate : input.date
    if (endKey < input.date) return { ok: false, reason: 'range' }
    return { ok: true, start: iso(input.date, '00:00'), end: iso(endKey, '23:59') }
  }
  const st = input.startTime
  const et = input.endTime
  if (!st || !et) return { ok: false, reason: 'missing' }
  if (st === et) return { ok: false, reason: 'same' }
  const start = iso(input.date, st)
  // end<=start면 자정 넘김 → 종료를 다음날 같은 시각으로
  const endSameDay = iso(input.date, et)
  const end = endSameDay <= start ? iso(addDayKey(input.date), et) : endSameDay
  return { ok: true, start, end }
}
