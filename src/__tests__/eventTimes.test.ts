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

  // tz 스루(Task 20 후속): 표시 evTz로 빌드하면 그 tz 벽시계 → 정확한 UTC ISO.
  it('timeZone=UTC: 벽시계 01:00→03:00을 UTC로 해석(드리프트 0)', () => {
    const r = buildEventTimes({ date: '2026-06-20', allDay: false, startTime: '01:00', endTime: '03:00', timeZone: 'UTC' })
    expect(r).toEqual({
      ok: true,
      start: '2026-06-20T01:00:00.000Z',
      end: '2026-06-20T03:00:00.000Z',
    })
  })

  it('timeZone 명시 없으면 DISPLAY_TZ(+09:00)로 해석(하위호환)', () => {
    const r = buildEventTimes({ date: '2026-06-16', allDay: false, startTime: '10:00', endTime: '12:00' })
    expect(r).toEqual({
      ok: true,
      start: '2026-06-16T01:00:00.000Z',
      end: '2026-06-16T03:00:00.000Z',
    })
  })

  it('timeZone=Asia/Tokyo(+09): Seoul과 동일 오프셋이라 UTC 결과 동일', () => {
    const seoul = buildEventTimes({ date: '2026-06-16', allDay: false, startTime: '10:00', endTime: '12:00', timeZone: 'Asia/Seoul' })
    const tokyo = buildEventTimes({ date: '2026-06-16', allDay: false, startTime: '10:00', endTime: '12:00', timeZone: 'Asia/Tokyo' })
    expect(tokyo).toEqual(seoul)
  })
})
