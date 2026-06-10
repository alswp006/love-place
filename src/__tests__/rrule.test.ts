import { describe, it, expect } from 'vitest'
import { parseRule, buildRule, expandOccurrences, expandEvents } from '@/lib/calendar/rrule'
import { dayKey } from '@/lib/calendar/eventDays'

const WIN_START = '2026-01-01T00:00:00Z'
const WIN_END = '2026-12-31T23:59:59Z'

describe('parseRule / buildRule', () => {
  it('FREQ/INTERVAL/COUNT 파싱', () => {
    const r = parseRule('FREQ=WEEKLY;INTERVAL=2;COUNT=5')
    expect(r).toMatchObject({ freq: 'WEEKLY', interval: 2, count: 5 })
  })
  it('FREQ 없거나 빈 문자열이면 null(반복 아님)', () => {
    expect(parseRule(null)).toBeNull()
    expect(parseRule('')).toBeNull()
    expect(parseRule('INTERVAL=2')).toBeNull()
  })
  it('EXDATE 파싱', () => {
    const r = parseRule('FREQ=DAILY;INTERVAL=1;EXDATE=2026-06-02,2026-06-03')
    expect(r?.exdates).toEqual(['2026-06-02', '2026-06-03'])
  })
  it('buildRule round-trip', () => {
    const s = buildRule('MONTHLY', 1, 3, ['2026-02-15'])
    expect(parseRule(s)).toMatchObject({ freq: 'MONTHLY', interval: 1, count: 3, exdates: ['2026-02-15'] })
  })
})

describe('expandOccurrences', () => {
  it('매일 COUNT=3', () => {
    const r = parseRule('FREQ=DAILY;INTERVAL=1;COUNT=3')!
    const occ = expandOccurrences('2026-06-01T01:00:00Z', r, WIN_START, WIN_END)
    expect(occ.map((o) => dayKey(o))).toEqual(['2026-06-01', '2026-06-02', '2026-06-03'])
  })
  it('매주 INTERVAL=1 COUNT=3', () => {
    const r = parseRule('FREQ=WEEKLY;INTERVAL=1;COUNT=3')!
    const occ = expandOccurrences('2026-06-01T01:00:00Z', r, WIN_START, WIN_END)
    expect(occ.map((o) => dayKey(o))).toEqual(['2026-06-01', '2026-06-08', '2026-06-15'])
  })
  it('매월 COUNT=3', () => {
    const r = parseRule('FREQ=MONTHLY;INTERVAL=1;COUNT=3')!
    const occ = expandOccurrences('2026-01-15T01:00:00Z', r, WIN_START, WIN_END)
    expect(occ.map((o) => dayKey(o))).toEqual(['2026-01-15', '2026-02-15', '2026-03-15'])
  })
  it('EXDATE 회차 제외', () => {
    const r = parseRule('FREQ=DAILY;INTERVAL=1;COUNT=3;EXDATE=2026-06-02')!
    const occ = expandOccurrences('2026-06-01T01:00:00Z', r, WIN_START, WIN_END)
    expect(occ.map((o) => dayKey(o))).toEqual(['2026-06-01', '2026-06-03'])
  })
  it('윈도우 밖 회차는 제외', () => {
    const r = parseRule('FREQ=DAILY;INTERVAL=1;COUNT=10')!
    const occ = expandOccurrences('2026-06-01T01:00:00Z', r, '2026-06-03T00:00:00Z', '2026-06-05T00:00:00Z')
    expect(occ.length).toBeGreaterThan(0)
    expect(occ.every((o) => o >= '2026-06-03T00:00:00Z' && o <= '2026-06-05T00:00:00Z')).toBe(true)
  })
})

describe('expandEvents', () => {
  it('비반복 이벤트는 윈도우 안일 때 1개, _seriesStart 보존', () => {
    const ev = { id: 'e1', start: '2026-06-10T01:00:00Z', end: '2026-06-10T02:00:00Z', recurrence_rule: null }
    const out = expandEvents([ev], WIN_START, WIN_END)
    expect(out).toHaveLength(1)
    expect(out[0]?._seriesStart).toBe('2026-06-10T01:00:00Z')
  })
  it('반복 이벤트는 전개되고 각 occurrence가 원래 길이를 유지', () => {
    const ev = {
      id: 'e2',
      start: '2026-06-01T01:00:00Z',
      end: '2026-06-01T02:30:00Z', // 90분
      recurrence_rule: 'FREQ=WEEKLY;INTERVAL=1;COUNT=2',
    }
    const out = expandEvents([ev], WIN_START, WIN_END)
    expect(out).toHaveLength(2)
    for (const o of out) {
      expect(new Date(o.end).getTime() - new Date(o.start).getTime()).toBe(90 * 60 * 1000)
      expect(o._seriesStart).toBe('2026-06-01T01:00:00Z') // 편집은 시리즈 기준
    }
  })
})
