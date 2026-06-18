// 구글 캘린더 오버레이용 순수 날짜 유틸 — 결정론적(문자열 기반, tz 안전)으로 테스트 가능.
import type { GcalEvent } from './types'

const DAY_MS = 86_400_000
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

// 기준일이 속한 주의 월요일 00:00 ~ +weeks주 범위. Google timeMin/timeMax(RFC3339)용 ISO 반환.
export function agendaRange(ref: Date, weeks = 4): { timeMin: string; timeMax: string } {
  const d = new Date(ref)
  d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7 // 월=0 … 일=6
  const start = new Date(d.getTime() - dow * DAY_MS)
  const end = new Date(start.getTime() + weeks * 7 * DAY_MS)
  return { timeMin: start.toISOString(), timeMax: end.toISOString() }
}

// 일정이 '속한 날짜'(이벤트 자체 tz 기준 문자열 — 결정론적). 종일/시간 모두 앞 10자.
export function dayKeyOf(ev: Pick<GcalEvent, 'start'>): string {
  return ev.start.slice(0, 10)
}

export type DayGroup = { dateKey: string; events: GcalEvent[] }

// 날짜별로 묶고, 날짜·시간 오름차순(종일은 그 날 맨 앞).
export function groupEventsByDay(events: GcalEvent[]): DayGroup[] {
  const map = new Map<string, GcalEvent[]>()
  for (const ev of events) {
    const k = dayKeyOf(ev)
    const arr = map.get(k)
    if (arr) arr.push(ev)
    else map.set(k, [ev])
  }
  const groups: DayGroup[] = [...map.entries()].map(([dateKey, evs]) => ({
    dateKey,
    events: evs.slice().sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
      return a.start.localeCompare(b.start)
    }),
  }))
  groups.sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  return groups
}

// 'YYYY-MM-DD' → '6월 18일 (목)'.
export function formatDayLabel(dateKey: string): string {
  const parts = dateKey.split('-').map(Number)
  const [y, m, d] = parts
  if (!y || !m || !d) return dateKey
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()] ?? ''
  return `${m}월 ${d}일 (${wd})`
}

// 일정 시간 라벨(이벤트 자체 tz 기준 문자열 — 결정론적). 종일은 '종일'.
export function formatEventTime(ev: Pick<GcalEvent, 'start' | 'allDay'>): string {
  if (ev.allDay) return '종일'
  return ev.start.slice(11, 16)
}
