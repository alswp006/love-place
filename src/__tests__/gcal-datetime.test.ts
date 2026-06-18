import { describe, it, expect } from 'vitest'
import {
  agendaRange,
  dayKeyOf,
  groupEventsByDay,
  formatDayLabel,
  formatEventTime,
} from '@/lib/gcal/datetime'
import type { GcalEvent } from '@/lib/gcal/types'

function ev(partial: Partial<GcalEvent> & { id: string; start: string }): GcalEvent {
  return {
    title: '일정',
    end: partial.start,
    allDay: false,
    ownerId: 'u1',
    color: '#4285F4',
    calendarSummary: '내 캘린더',
    source: 'GOOGLE',
    ...partial,
  }
}

describe('gcal datetime 유틸', () => {
  it('agendaRange: 주 시작(월) 00:00 ~ +N주, 정확히 7*N일 범위', () => {
    const r = agendaRange(new Date('2026-06-18T12:00:00'), 4) // 목요일
    const min = new Date(r.timeMin)
    const max = new Date(r.timeMax)
    expect(min.getDay()).toBe(1) // 월요일로 정렬
    expect(max.getTime() - min.getTime()).toBe(28 * 86_400_000)
  })

  it('dayKeyOf: 종일/시간 모두 앞 10자(tz 안전)', () => {
    expect(dayKeyOf({ start: '2026-06-18' })).toBe('2026-06-18')
    expect(dayKeyOf({ start: '2026-06-18T09:30:00+09:00' })).toBe('2026-06-18')
  })

  it('groupEventsByDay: 날짜별로 묶고 정렬, 종일은 그 날 맨 앞', () => {
    const events: GcalEvent[] = [
      ev({ id: 'a', start: '2026-06-19T10:00:00+09:00' }),
      ev({ id: 'b', start: '2026-06-18T09:00:00+09:00' }),
      ev({ id: 'c', start: '2026-06-18', allDay: true }),
      ev({ id: 'd', start: '2026-06-18T08:00:00+09:00' }),
    ]
    const groups = groupEventsByDay(events)
    expect(groups.map((g) => g.dateKey)).toEqual(['2026-06-18', '2026-06-19'])
    // 18일: 종일(c) 먼저, 그 다음 시간순(d 08:00 → b 09:00)
    expect(groups[0]?.events.map((e) => e.id)).toEqual(['c', 'd', 'b'])
    expect(groups[1]?.events.map((e) => e.id)).toEqual(['a'])
  })

  it('formatDayLabel: YYYY-MM-DD → "M월 D일 (요일)"', () => {
    expect(formatDayLabel('2026-06-18')).toBe('6월 18일 (목)')
  })

  it('formatEventTime: 종일은 "종일", 시간은 HH:mm(이벤트 tz 기준)', () => {
    expect(formatEventTime({ start: '2026-06-18', allDay: true })).toBe('종일')
    expect(formatEventTime({ start: '2026-06-18T09:30:00+09:00', allDay: false })).toBe('09:30')
  })
})
