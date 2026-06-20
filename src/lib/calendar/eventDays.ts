// 캘린더 날짜 도출 — 순수 함수(테스트로 못박음). 두 단말 일치를 위해 고정 표시 타임존(기본 Asia/Seoul)으로
// 일 단위 버킷팅(§5.1 "타임존 어긋남 0"의 핵심 = 두 단말이 같은 날짜 버킷). 이벤트별 tz 표시는 후속 정교화.

export const DISPLAY_TZ = 'Asia/Seoul'

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** ISO 시각 → 표시 tz 기준 캘린더 날짜 키 'YYYY-MM-DD'. */
export function dayKey(iso: string, tz: string = DISPLAY_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

/** ISO 시각 → 표시 tz 기준 'HH:mm'(24시간). */
export function formatTime(iso: string, tz: string = DISPLAY_TZ): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

export function ymdKey(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`
}

export type DayCell = { key: string; day: number; inMonth: boolean }

/** 월 그리드(6주×7=42칸). 일요일 시작. UTC 산술로 로컬 tz 흔들림 방지(라벨만 — 버킷은 dayKey가 담당). */
export function monthMatrix(year: number, month0: number): DayCell[] {
  const firstDow = new Date(Date.UTC(year, month0, 1)).getUTCDay() // 0=일
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
  const cells: DayCell[] = []

  // 앞 패딩(이전 달 말일들)
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month0, -i))
    cells.push({ key: ymdKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), day: d.getUTCDate(), inMonth: false })
  }
  // 이번 달
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ key: ymdKey(year, month0, day), day, inMonth: true })
  }
  // 뒤 패딩(다음 달 초)으로 42칸 채움
  let next = 1
  while (cells.length < 42) {
    const d = new Date(Date.UTC(year, month0 + 1, next))
    cells.push({ key: ymdKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), day: next, inMonth: false })
    next++
  }
  return cells
}

/** anchorKey('YYYY-MM-DD')가 속한 주(일요일 시작) 7칸. UTC 산술. */
export function weekMatrix(anchorKey: string): DayCell[] {
  const [y, m, d] = anchorKey.split('-').map(Number)
  const base = new Date(Date.UTC(y!, (m ?? 1) - 1, d!))
  const dow = base.getUTCDay() // 0=일
  const cells: DayCell[] = []
  for (let i = 0; i < 7; i++) {
    const cur = new Date(Date.UTC(y!, (m ?? 1) - 1, d! - dow + i))
    cells.push({ key: ymdKey(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate()), day: cur.getUTCDate(), inMonth: true })
  }
  return cells
}

/** ISO → 표시 tz 기준 자정으로부터의 분(타임라인 세로 위치용). 0..1439. */
export function minuteOfDay(iso: string, tz: string = DISPLAY_TZ): number {
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
  const [h, mi] = hm.split(':').map(Number)
  return (h ?? 0) * 60 + (mi ?? 0)
}

export function addMonths(year: number, month0: number, delta: number): { year: number; month0: number } {
  const total = year * 12 + month0 + delta
  return { year: Math.floor(total / 12), month0: ((total % 12) + 12) % 12 }
}

/** 두 날짜 키('YYYY-MM-DD') 사이 일수(to - from). 음수면 과거. */
export function diffDays(fromKey: string, toKey: string): number {
  const f = fromKey.split('-')
  const t = toKey.split('-')
  const from = Date.UTC(Number(f[0]), Number(f[1]) - 1, Number(f[2]))
  const to = Date.UTC(Number(t[0]), Number(t[1]) - 1, Number(t[2]))
  return Math.round((to - from) / 86400000)
}

/** D-day 라벨: 오늘 / 내일 / D-3 / 3일 전. */
export function dDayLabel(targetKey: string, todayKey: string): string {
  const d = diffDays(todayKey, targetKey)
  if (d === 0) return '오늘'
  if (d === 1) return '내일'
  if (d > 0) return `D-${d}`
  return `${-d}일 전`
}

export type DayGroupable = { start: string }

/** 이벤트를 표시 tz 기준 날짜별로 버킷팅하고 각 날짜 안에서 시작시각 순 정렬. */
export function groupByDay<T extends DayGroupable>(events: T[], tz: string = DISPLAY_TZ): Record<string, T[]> {
  const map: Record<string, T[]> = {}
  for (const e of events) {
    const k = dayKey(e.start, tz)
    ;(map[k] ??= []).push(e)
  }
  for (const k of Object.keys(map)) {
    map[k]!.sort((a, b) => a.start.localeCompare(b.start))
  }
  return map
}

/** 지금(nowIso) 이후 시작하는 일정만 시작시각 순으로(다가오는 일정 — 오늘 카드용). */
export function upcomingEvents<T extends DayGroupable>(events: T[], nowIso: string): T[] {
  return events.filter((e) => e.start >= nowIso).sort((a, b) => a.start.localeCompare(b.start))
}
