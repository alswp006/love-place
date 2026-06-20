import { describe, it, expect } from 'vitest'
import { exdateOccurrence, splitFollowing, shiftTimesToOccurrence } from '@/lib/calendar/recurrenceScope'
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

describe('shiftTimesToOccurrence', () => {
  it('앵커 날의 start/end를 회차 날로 평행이동(벽시계·기간 보존)', () => {
    // 앵커 06-20 KST 10:00~11:00(1h) → 회차 06-27로 이동.
    const r = shiftTimesToOccurrence('2026-06-20T01:00:00.000Z', '2026-06-20T02:00:00.000Z', '2026-06-27')
    expect(dayKey(r.start)).toBe('2026-06-27')
    expect(dayKey(r.end)).toBe('2026-06-27')
    expect(new Date(r.end).getTime() - new Date(r.start).getTime()).toBe(60 * 60 * 1000)
  })
  it('자정 넘김(다음날 종료) 기간도 보존', () => {
    // 06-20 23:00 ~ 06-21 00:30 (1.5h, 자정 넘김) → 07-04로 이동: 종료는 07-05.
    const r = shiftTimesToOccurrence('2026-06-20T14:00:00.000Z', '2026-06-20T15:30:00.000Z', '2026-07-04')
    expect(dayKey(r.start)).toBe('2026-07-04')
    expect(new Date(r.end).getTime() - new Date(r.start).getTime()).toBe(90 * 60 * 1000)
  })
  it('이미 같은 날이면 그대로(앵커=첫 회차 케이스)', () => {
    const r = shiftTimesToOccurrence('2026-06-20T01:00:00.000Z', '2026-06-20T02:00:00.000Z', '2026-06-20')
    expect(r.start).toBe('2026-06-20T01:00:00.000Z')
    expect(r.end).toBe('2026-06-20T02:00:00.000Z')
  })
})
