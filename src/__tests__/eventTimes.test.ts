import { describe, expect, it } from 'vitest'
import { buildEventTimes } from '@/lib/calendar/eventTimes'

describe('buildEventTimes', () => {
  it('종일: KST 00:00 → 23:59 (다른 날 두 ISO 경계)', () => {
    const r = buildEventTimes({ date: '2026-06-16', allDay: true })
    expect(r).toEqual({
      ok: true,
      start: '2026-06-15T15:00:00.000Z',
      end: '2026-06-16T14:59:00.000Z',
    })
  })

  it('정상 시간: ok이고 end > start', () => {
    const r = buildEventTimes({ date: '2026-06-16', allDay: false, startTime: '10:00', endTime: '12:00' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(new Date(r.end).getTime()).toBeGreaterThan(new Date(r.start).getTime())
    }
  })

  it('자정 넘김: end가 start+2h(다음날 01:00 KST)로 롤', () => {
    const r = buildEventTimes({ date: '2026-06-16', allDay: false, startTime: '23:00', endTime: '01:00' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.end).toBe('2026-06-16T16:00:00.000Z')
      expect(new Date(r.end).getTime() - new Date(r.start).getTime()).toBe(2 * 60 * 60 * 1000)
    }
  })

  it('같은 시각: 0길이 거부 (ok:false, reason:same)', () => {
    const r = buildEventTimes({ date: '2026-06-16', allDay: false, startTime: '10:00', endTime: '10:00' })
    expect(r).toEqual({ ok: false, reason: 'same' })
  })

  it('종일 다일: start=06-16 00:00 KST, end=06-18 23:59 KST', () => {
    const r = buildEventTimes({ date: '2026-06-16', allDay: true, endDate: '2026-06-18' })
    expect(r).toEqual({
      ok: true,
      start: '2026-06-15T15:00:00.000Z',
      end: '2026-06-18T14:59:00.000Z',
    })
  })

  it('종일 endDate<date → ok:false, reason:range', () => {
    const r = buildEventTimes({ date: '2026-06-16', allDay: true, endDate: '2026-06-14' })
    expect(r).toEqual({ ok: false, reason: 'range' })
  })
})
