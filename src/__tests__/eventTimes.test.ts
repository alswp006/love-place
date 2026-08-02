import { describe, expect, it } from 'vitest'
import { buildEventTimes, followEndTime } from '@/lib/calendar/eventTimes'

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

describe('followEndTime — 시작을 옮기면 종료가 따라온다(22시간 일정 방지)', () => {
  it('길이를 보존한다', () => {
    // 10:00~11:00(1시간) 짜리의 시작을 13:00으로 → 14:00
    expect(followEndTime('10:00', '13:00', '11:00')).toBe('14:00')
  })

  it('회귀: 시작만 뒤로 밀어도 end<=start가 되지 않는다(예전엔 22시간짜리가 조용히 저장됐다)', () => {
    const nextEnd = followEndTime('10:00', '13:00', '11:00')
    const r = buildEventTimes({ date: '2026-07-25', allDay: false, startTime: '13:00', endTime: nextEnd })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const hours = (new Date(r.end).getTime() - new Date(r.start).getTime()) / 3600000
      expect(hours).toBe(1) // 22가 아니라 1
    }
  })

  it('자정 넘김 길이도 보존한다(23:00~01:00 = 2시간)', () => {
    expect(followEndTime('23:00', '20:00', '01:00')).toBe('22:00')
  })

  it('따라온 종료가 자정을 넘으면 그대로 넘긴다(유효한 입력)', () => {
    // 22:00~23:00(1시간)의 시작을 23:30으로 → 00:30(다음날) — buildEventTimes가 롤 처리.
    expect(followEndTime('22:00', '23:30', '23:00')).toBe('00:30')
  })

  it('분 단위도 정확히 따라온다', () => {
    expect(followEndTime('09:15', '10:45', '10:00')).toBe('11:30')
  })
})
