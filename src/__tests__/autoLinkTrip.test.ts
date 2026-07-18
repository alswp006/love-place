import { describe, it, expect } from 'vitest'
import { soleTripCovering, localDayKey } from '@/lib/journey/autoLink'

// 동선 종료 자동 연결 규칙 — '오늘을 포함하는 여행이 정확히 하나'일 때만 자동, 모호하면 수동 폴백.
const trip = (id: string, start: string, end: string) => ({
  id,
  title: `여행 ${id}`,
  start_date: start,
  end_date: end,
})

describe('soleTripCovering — 자동 연결 유일성 판정', () => {
  it('포함하는 여행이 1개면 그 여행', () => {
    const t = trip('a', '2026-07-18', '2026-07-20')
    expect(soleTripCovering([t], '2026-07-19')).toEqual(t)
  })

  it('시작일·종료일 당일도 포함(경계 포함)', () => {
    const t = trip('a', '2026-07-19', '2026-07-19')
    expect(soleTripCovering([t], '2026-07-19')).toEqual(t)
  })

  it('포함하는 여행이 없으면 null(수동 폴백)', () => {
    expect(soleTripCovering([trip('a', '2026-07-01', '2026-07-02')], '2026-07-19')).toBeNull()
  })

  it('둘 이상이면 모호 → null(수동 폴백)', () => {
    const ts = [trip('a', '2026-07-18', '2026-07-20'), trip('b', '2026-07-19', '2026-07-21')]
    expect(soleTripCovering(ts, '2026-07-19')).toBeNull()
  })
})

describe('localDayKey — 로컬 날짜 YYYY-MM-DD(여행 날짜와 같은 기준)', () => {
  it('자릿수 패딩 포함 로컬 날짜', () => {
    expect(localDayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
