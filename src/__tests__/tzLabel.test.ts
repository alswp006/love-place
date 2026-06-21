import { describe, it, expect } from 'vitest'
import { tzNote } from '@/lib/calendar/tzLabel'
import { DISPLAY_TZ, formatTime } from '@/lib/calendar/eventDays'

// Task 20(R4): 이벤트가 다른 tz로 저장됐을 때만 로컬시각(여행 현지시각) 노트.
// eventTz===displayTz면 null(노출 안 함). 다르면 eventTz 기준 시각 라벨 — 색 비의존 텍스트.
describe('tzNote(iso, eventTz, displayTz)', () => {
  // 2026-06-20 10:00 KST = 01:00 UTC = 도쿄 10:00(KST와 동일 오프셋이라 분 변화 검증엔 부적합) → UTC 비교로 차이 확인.
  const iso = '2026-06-20T01:00:00Z' // Seoul 10:00, Tokyo 10:00, UTC 01:00

  it('eventTz === displayTz이면 null', () => {
    expect(tzNote(iso, DISPLAY_TZ, DISPLAY_TZ)).toBeNull()
  })

  it('eventTz가 비어있으면 null', () => {
    expect(tzNote(iso, '', DISPLAY_TZ)).toBeNull()
  })

  it('eventTz !== displayTz이면 eventTz 기준 시각 라벨', () => {
    const note = tzNote(iso, 'UTC', DISPLAY_TZ)
    expect(note).toBe(`이 일정은 UTC 기준 ${formatTime(iso, 'UTC')}`)
    // UTC 01:00은 Seoul 표시(10:00)와 다른 시각이어야 한다(현지시각 노출의 의의).
    expect(formatTime(iso, 'UTC')).not.toBe(formatTime(iso, DISPLAY_TZ))
  })
})
