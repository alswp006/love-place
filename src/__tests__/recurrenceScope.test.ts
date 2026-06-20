import { describe, it, expect } from 'vitest'
import { exdateOccurrence, splitFollowing } from '@/lib/calendar/recurrenceScope'
import { parseRule, expandOccurrences } from '@/lib/calendar/rrule'
import { dayKey } from '@/lib/calendar/eventDays'

describe('exdateOccurrence', () => {
  it('EXDATE 없으면 dayKey append', () => {
    expect(exdateOccurrence('FREQ=DAILY;INTERVAL=1;COUNT=5', '2026-06-17')).toBe(
      'FREQ=DAILY;INTERVAL=1;COUNT=5;EXDATE=2026-06-17',
    )
  })
  it('기존 EXDATE 보존하고 키 추가', () => {
    expect(exdateOccurrence('FREQ=DAILY;INTERVAL=1;EXDATE=2026-06-16', '2026-06-17')).toBe(
      'FREQ=DAILY;INTERVAL=1;EXDATE=2026-06-16,2026-06-17',
    )
  })
  it('이미 있는 키는 중복 추가하지 않음', () => {
    expect(exdateOccurrence('FREQ=DAILY;INTERVAL=1;EXDATE=2026-06-17', '2026-06-17')).toBe(
      'FREQ=DAILY;INTERVAL=1;EXDATE=2026-06-17',
    )
  })
})

describe('splitFollowing', () => {
  it('분할일 직전까지로 시리즈를 절단하고 분할일을 새 시리즈 시작키로', () => {
    const seriesStart = '2026-06-16T01:00:00Z' // KST 10:00 DAILY
    const occStartIso = '2026-06-18T01:00:00Z' // dayKey 2026-06-18
    const { truncatedRule, newSeriesStartKey } = splitFollowing(
      'FREQ=DAILY;INTERVAL=1',
      occStartIso,
    )
    expect(newSeriesStartKey).toBe('2026-06-18')
    const win = { start: '2026-06-16T00:00:00Z', end: '2026-06-25T00:00:00Z' }
    const rule = parseRule(truncatedRule)
    expect(rule).not.toBeNull()
    expect(expandOccurrences(seriesStart, rule!, win.start, win.end).map((s) => dayKey(s))).toEqual([
      '2026-06-16',
      '2026-06-17',
    ])
  })
})
