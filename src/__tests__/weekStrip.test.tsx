import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { WeekStrip } from '@/components/calendar/WeekStrip'

// Task 18(R4.5): WeekStrip의 `data-dow`가 today-offset이 아니라 그 셀의 실제 요일(0=일..6=토)이어야 한다.
// weekMatrix는 일요일 시작 7칸이므로 칩의 data-dow는 셀 키의 실제 UTC 요일과 일치해야 한다.

/** 'YYYY-MM-DD'의 실제 요일(0=일..6=토) — UTC 산술(eventDays와 동일 기준). */
function realDow(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d!)).getUTCDay()
}

describe('WeekStrip data-dow (Task 18 — 실제 요일)', () => {
  it('각 칩의 data-dow가 그 셀 날짜의 실제 요일과 일치한다(today와 무관)', () => {
    // selected=수요일(2026-06-17), today=금요일(2026-06-19): today-offset 버그면 일요일 칩 data-dow≠0.
    const { container } = render(
      <WeekStrip
        selected="2026-06-17"
        todayKey="2026-06-19"
        hasEventsByKey={() => false}
        onSelect={() => {}}
      />,
    )
    const chips = Array.from(container.querySelectorAll('[data-dow]'))
    expect(chips).toHaveLength(7)
    // 라벨은 셀 날짜 키를 aria-label 앞부분에 담는다 → 키로 실제 요일 도출 후 대조.
    for (const chip of chips) {
      const label = chip.getAttribute('aria-label') ?? ''
      const key = label.slice(0, 10) // 'YYYY-MM-DD'
      expect(chip.getAttribute('data-dow')).toBe(String(realDow(key)))
    }
  })

  it('일요일 시작 주: 첫 칩 data-dow=0(일), 수요일 셀=3, 마지막=6(토)', () => {
    const { container } = render(
      <WeekStrip
        selected="2026-06-17"
        todayKey="2026-06-19"
        hasEventsByKey={() => false}
        onSelect={() => {}}
      />,
    )
    const dows = Array.from(container.querySelectorAll('[data-dow]')).map((c) => c.getAttribute('data-dow'))
    expect(dows).toEqual(['0', '1', '2', '3', '4', '5', '6'])
  })
})
