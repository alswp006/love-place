import { describe, it, expect } from 'vitest'
import {
  holidayLabel,
  holidayName,
  isRestDay,
  isSubstituteHoliday,
  isSundayOrHoliday,
  koreanHolidays,
} from '@/lib/calendar/holidays'

// ⚠️ 기대값은 Flutter판 `app/test/calendar/holidays_test.dart`와 **같다**.
//    두 앱이 같은 달력을 보여줘야 하므로 한쪽만 통과하는 값이 있으면 그게 곧 버그다.

describe('음력 명절 — 표로 구웠다', () => {
  it('2026 설날 2/16~2/18 (설날은 2/17)', () => {
    expect(holidayName('2026-02-16')).toBe('설날')
    expect(holidayName('2026-02-17')).toBe('설날')
    expect(holidayName('2026-02-18')).toBe('설날')
  })
  it('2026 추석 9/24~9/26 (추석은 9/25)', () => {
    expect(holidayName('2026-09-24')).toBe('추석')
    expect(holidayName('2026-09-25')).toBe('추석')
    expect(holidayName('2026-09-26')).toBe('추석')
  })
  it('연휴 가운데가 일요일이어도 빠지지 않는다 — 2027 설날 2/7', () => {
    expect(holidayName('2027-02-07')).toBe('설날')
  })
})

describe('대체공휴일', () => {
  it('3·1절이 일요일이면 월요일로 — 2026', () => {
    // 원래 날에도 이름이 남는다. 그래야 3/1이 아무 날도 아닌 것처럼 보이지 않는다.
    expect(holidayLabel('2026-03-01')).toBe('3·1절')
    expect(holidayLabel('2026-03-02')).toBe('대체공휴일')
  })
  it('광복절이 토요일이면 월요일로 — 2026', () => {
    expect(holidayLabel('2026-08-15')).toBe('광복절')
    expect(holidayLabel('2026-08-17')).toBe('대체공휴일')
  })
  it('개천절이 토요일이면 월요일로 — 2026', () => {
    expect(holidayLabel('2026-10-03')).toBe('개천절')
    expect(holidayLabel('2026-10-05')).toBe('대체공휴일')
  })
  it('원래 날에 쉬면 대체가 아니다 — 2026 한글날 10/9(금)', () => {
    expect(holidayLabel('2026-10-09')).toBe('한글날')
    expect(isSubstituteHoliday('2026-10-09')).toBe(false)
  })
  it('현충일·크리스마스는 대체 대상이 아니다', () => {
    expect(holidayName('2026-06-06')).toBe('현충일')
    expect(holidayName('2026-06-08')).toBeNull()
    expect(holidayName('2026-12-25')).toBe('크리스마스')
  })
})

describe('공휴일이 아닌 날', () => {
  it('제헌절은 공휴일이 아니다(2008년부터)', () => {
    expect(holidayName('2026-07-17')).toBeNull()
  })
  it('근로자의 날도 관공서 공휴일이 아니다', () => {
    expect(holidayName('2026-05-01')).toBeNull()
  })
  it('표 밖의 해는 공휴일이 없는 것으로 — 없는 날을 지어내지 않는다', () => {
    expect(holidayName('2040-01-01')).toBeNull()
    expect(holidayLabel('2020-01-01')).toBeNull()
  })
  it('형식이 어긋나면 false — 화면이 죽지 않는다', () => {
    expect(isRestDay('엉망')).toBe(false)
    expect(isSundayOrHoliday('2026-13-99')).toBe(false)
    expect(holidayLabel('')).toBeNull()
  })
})

describe('쉬는 날', () => {
  it('주말은 쉬는 날이다', () => {
    expect(isRestDay('2026-09-19')).toBe(true) // 토
    expect(isRestDay('2026-09-20')).toBe(true) // 일
    expect(isRestDay('2026-09-21')).toBe(false) // 월
  })
  it('평일 공휴일도 쉬는 날이다', () => {
    expect(isRestDay('2026-09-25')).toBe(true) // 금 + 추석
    expect(isRestDay('2026-03-02')).toBe(true) // 월 + 대체공휴일
  })
  it('일요일·공휴일과 토요일을 가를 수 있다', () => {
    // 토요일은 쉬는 날이지만 일요일·공휴일과 **다른 색**을 준다.
    // 9/26을 토요일 예로 쓰면 안 된다 — 그 날은 추석이라 공휴일이다.
    expect(isSundayOrHoliday('2026-09-19')).toBe(false) // 토
    expect(isSundayOrHoliday('2026-09-20')).toBe(true) // 일
    expect(isSundayOrHoliday('2026-09-25')).toBe(true) // 금 + 추석
  })
})

describe('표 자체', () => {
  it('2025~2035만 담는다 — 범위를 말과 맞춘다', () => {
    const years = new Set(Object.keys(koreanHolidays).map((k) => Number(k.slice(0, 4))))
    expect(Math.min(...years)).toBe(2025)
    expect(Math.max(...years)).toBe(2035)
  })
  it('빈 이름이 없다 — 생성이 어긋나면 여기서 걸린다', () => {
    for (const [key, [name]] of Object.entries(koreanHolidays)) {
      expect(name.trim(), key).not.toBe('')
      expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
