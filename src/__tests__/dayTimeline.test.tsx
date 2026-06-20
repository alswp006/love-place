import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { EventRow } from '@/hooks/useEvents'
import type { Occurrence } from '@/lib/calendar/rrule'
import { DayTimeline } from '@/components/calendar/DayTimeline'

// Task 12(R2.3): Day 타임라인 뷰 — flat agenda → 시간축 배치. minuteOfDay(Task 3)로 세로 위치.
// 종일 이벤트는 상단 종일 밴드(all-day lane), 시간 이벤트는 top px가 minuteOfDay에 비례.
// 반복 occurrence는 composite key(`${id}:${start}`)로 키 충돌 방지(조사 01 §4).
// vitest는 css:false라 클래스명이 없으므로 검증은 인라인 style(top)·라벨·role 기준.

const day = '2026-06-15'
function occ(id: string, title: string, startHm: string, endHm: string, allDay = false): Occurrence<EventRow> {
  const start = `${day}T${startHm}:00+09:00`
  const end = `${day}T${endHm}:00+09:00`
  return {
    id,
    title,
    start,
    end,
    is_all_day: allDay,
    time_zone: 'Asia/Seoul',
    visibility: 'SHARED',
    participants: 'BOTH',
    owner_id: 'u1',
    place_id: null,
    memo: null,
    recurrence_rule: null,
    reminders: [],
    version: 1,
    _seriesStart: start,
    _seriesEnd: end,
  }
}

function topPx(el: HTMLElement): number {
  // 인라인 style의 top(예: '41.666...%')에서 숫자만 추출.
  const m = /top:\s*([\d.]+)/.exec(el.getAttribute('style') ?? '')
  return m ? Number(m[1]) : NaN
}

describe('DayTimeline(Task 12 — 시간축 배치 + 종일 밴드)', () => {
  it('시간 이벤트는 minuteOfDay에 비례한 top, 10:00 < 14:30', () => {
    const morning = occ('e1', '아침 미팅', '10:00', '11:00')
    const after = occ('e2', '오후 산책', '14:30', '15:00')
    render(<DayTimeline dateKey={day} occurrences={[morning, after]} myId="u1" onEdit={() => {}} onAdd={() => {}} />)

    const mEl = screen.getByText('아침 미팅').closest('[data-occ]') as HTMLElement
    const aEl = screen.getByText('오후 산책').closest('[data-occ]') as HTMLElement
    expect(mEl).toBeTruthy()
    expect(aEl).toBeTruthy()
    // 10:00(600분) < 14:30(870분) → 위쪽이 더 작은 top.
    expect(topPx(mEl)).toBeLessThan(topPx(aEl))
    expect(topPx(mEl)).toBeGreaterThanOrEqual(0)
  })

  it('종일 이벤트는 상단 종일 밴드(all-day lane)에 들어간다', () => {
    const allDay = occ('e3', '기념일', '00:00', '23:59', true)
    const timed = occ('e1', '아침 미팅', '10:00', '11:00')
    render(<DayTimeline dateKey={day} occurrences={[allDay, timed]} myId="u1" onEdit={() => {}} onAdd={() => {}} />)

    const lane = screen.getByLabelText('종일 일정')
    expect(lane).toBeInTheDocument()
    // 종일 이벤트는 밴드 안에 위치(시간축 절대배치가 아님 — top 인라인 없음).
    const allDayEl = screen.getByText('기념일').closest('[data-occ]') as HTMLElement
    expect(lane.contains(allDayEl)).toBe(true)
  })

  it('빈 날 → CTA 안내', () => {
    render(<DayTimeline dateKey={day} occurrences={[]} myId="u1" onEdit={() => {}} onAdd={() => {}} />)
    expect(screen.getByText(/이 날 일정이 없어요/)).toBeInTheDocument()
  })

  it('반복 occurrence 키 충돌 방지: 같은 id의 두 occurrence 모두 렌더', () => {
    // 같은 시리즈 id가 다른 날짜/시각 occurrence로 두 번 들어와도 둘 다 렌더(composite key).
    const o1 = occ('rep', '운동', '07:00', '08:00')
    const o2: Occurrence<EventRow> = { ...occ('rep', '운동', '19:00', '20:00') }
    render(<DayTimeline dateKey={day} occurrences={[o1, o2]} myId="u1" onEdit={() => {}} onAdd={() => {}} />)
    expect(screen.getAllByText('운동')).toHaveLength(2)
  })

  it('occurrence 클릭 → onEdit에 occurrence 전달(범위 시트 연계)', async () => {
    const onEdit = vi.fn()
    const morning = occ('e1', '아침 미팅', '10:00', '11:00')
    render(<DayTimeline dateKey={day} occurrences={[morning]} myId="u1" onEdit={onEdit} onAdd={() => {}} />)
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    await user.click(screen.getByText('아침 미팅'))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit.mock.calls[0]?.[0]).toMatchObject({ id: 'e1', start: morning.start })
  })
})
