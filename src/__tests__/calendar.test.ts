import { describe, it, expect } from 'vitest'
import { deriveTrack } from '@/lib/calendar/track'
import {
  dayKey,
  monthMatrix,
  addMonths,
  groupByDay,
  diffDays,
  dDayLabel,
  upcomingEvents,
  weekMatrix,
  minuteOfDay,
} from '@/lib/calendar/eventDays'

const ME = 'me-uuid'
const PARTNER = 'partner-uuid'

describe('deriveTrack (색 도출 — 두 단말 일치)', () => {
  it('SHARED는 누가 봐도 함께(shared)', () => {
    expect(deriveTrack({ visibility: 'SHARED', owner_id: ME }, ME)).toBe('shared')
    expect(deriveTrack({ visibility: 'SHARED', owner_id: ME }, PARTNER)).toBe('shared')
  })
  it('PERSONAL은 보는 사람 기준: 내 것=mine, 상대 것=partner', () => {
    const ev = { visibility: 'PERSONAL' as const, owner_id: ME }
    expect(deriveTrack(ev, ME)).toBe('mine') // 내 화면
    expect(deriveTrack(ev, PARTNER)).toBe('partner') // 상대 화면
  })
  it('myId 미상이면 PERSONAL은 partner로 안전 도출', () => {
    expect(deriveTrack({ visibility: 'PERSONAL', owner_id: ME }, null)).toBe('partner')
  })
})

describe('dayKey (타임존 버킷)', () => {
  it('UTC 15:00 → KST 익일 00:00 (날짜 넘어감)', () => {
    expect(dayKey('2026-06-09T15:00:00Z', 'Asia/Seoul')).toBe('2026-06-10')
  })
  it('UTC 14:59 → KST 같은 날 23:59', () => {
    expect(dayKey('2026-06-09T14:59:00Z', 'Asia/Seoul')).toBe('2026-06-09')
  })
})

describe('monthMatrix', () => {
  it('항상 42칸(6주)', () => {
    expect(monthMatrix(2026, 5)).toHaveLength(42)
  })
  it('이번 달 칸 수 = 그 달 일수, 첫 inMonth 칸은 1일', () => {
    const cells = monthMatrix(2026, 5) // 6월(30일)
    const inMonth = cells.filter((c) => c.inMonth)
    expect(inMonth).toHaveLength(30)
    expect(inMonth[0]?.day).toBe(1)
    expect(inMonth[inMonth.length - 1]?.day).toBe(30)
  })
  it('2월(28/29일) 경계', () => {
    expect(monthMatrix(2026, 1).filter((c) => c.inMonth)).toHaveLength(28) // 2026-02
    expect(monthMatrix(2024, 1).filter((c) => c.inMonth)).toHaveLength(29) // 2024 윤년
  })
})

describe('addMonths (경계 래핑)', () => {
  it('12월 +1 → 다음 해 1월', () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month0: 0 })
  })
  it('1월 -1 → 이전 해 12월', () => {
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month0: 11 })
  })
})

describe('groupByDay', () => {
  it('날짜별 버킷 + 각 날짜 시작시각 순 정렬', () => {
    const events = [
      { id: 'b', start: '2026-06-10T05:00:00Z' },
      { id: 'a', start: '2026-06-10T01:00:00Z' },
      { id: 'c', start: '2026-06-11T01:00:00Z' },
    ]
    const grouped = groupByDay(events, 'Asia/Seoul')
    expect(grouped['2026-06-10']?.map((e) => e.id)).toEqual(['a', 'b']) // 시각 순
    expect(grouped['2026-06-11']?.map((e) => e.id)).toEqual(['c'])
  })
})

describe('diffDays / dDayLabel', () => {
  it('일수 차(to - from)', () => {
    expect(diffDays('2026-06-10', '2026-06-13')).toBe(3)
    expect(diffDays('2026-06-10', '2026-06-09')).toBe(-1)
    expect(diffDays('2026-06-30', '2026-07-01')).toBe(1) // 월 경계
  })
  it('D-day 라벨', () => {
    expect(dDayLabel('2026-06-10', '2026-06-10')).toBe('오늘')
    expect(dDayLabel('2026-06-11', '2026-06-10')).toBe('내일')
    expect(dDayLabel('2026-06-13', '2026-06-10')).toBe('D-3')
    expect(dDayLabel('2026-06-08', '2026-06-10')).toBe('2일 전')
  })
})

describe('weekMatrix (주 7일 — 일요일 시작)', () => {
  it('화요일 앵커 → 일요일 시작 7칸', () => {
    const cells = weekMatrix('2026-06-16') // 화요일
    expect(cells).toHaveLength(7)
    expect(cells[0]?.key).toBe('2026-06-14') // 일요일 시작
    expect(cells[6]?.key).toBe('2026-06-20')
    expect(cells[0]).toEqual({ key: '2026-06-14', day: 14, inMonth: true })
    expect(cells.every((c) => c.inMonth)).toBe(true) // DayCell 재사용 — inMonth 무의미 → true
  })
})

describe('minuteOfDay (타임라인 세로 위치)', () => {
  it('UTC 01:30 → KST 10:30 = 630분', () => {
    expect(minuteOfDay('2026-06-16T01:30:00Z')).toBe(630)
  })
  it('UTC 15:00 → KST 익일 00:00 = 0분', () => {
    expect(minuteOfDay('2026-06-15T15:00:00Z')).toBe(0)
  })
})

describe('upcomingEvents', () => {
  it('지금 이후 일정만 시작 순으로', () => {
    const now = '2026-06-10T03:00:00Z'
    const events = [
      { id: 'past', start: '2026-06-10T01:00:00Z' },
      { id: 'soon', start: '2026-06-10T05:00:00Z' },
      { id: 'later', start: '2026-06-12T05:00:00Z' },
    ]
    expect(upcomingEvents(events, now).map((e) => e.id)).toEqual(['soon', 'later'])
  })
})
