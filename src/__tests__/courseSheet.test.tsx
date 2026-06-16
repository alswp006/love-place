import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CourseSheet } from '@/components/discover/CourseSheet'
import type { CoursePlace, CourseStop } from '@/lib/route/coursePlan'

// CourseSheet는 표현형(no immediate write): 데이터 훅을 호출하지 않고 props로 받는다.
// buildCoursePlan(순수 함수)으로 타임라인을 미리보기하고, 확인 시에만 onConfirm으로 결과를 올린다.

const places: CoursePlace[] = [
  { id: 'p1', name: '칠성조선소', lat: 38.2, lng: 128.59 },
  { id: 'p2', name: '속초해변', lat: 38.19, lng: 128.6 },
]

function renderSheet(over: Partial<Parameters<typeof CourseSheet>[0]> = {}) {
  const props: Parameters<typeof CourseSheet>[0] = {
    regionLabel: '속초',
    places,
    defaultDate: '2026-06-20',
    busy: false,
    onCancel: () => {},
    onConfirm: () => {},
    ...over,
  }
  return render(<CourseSheet {...props} />)
}

describe('CourseSheet (코스 미리보기)', () => {
  it('role="dialog" + aria-modal로 렌더된다', () => {
    renderSheet()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('날짜·시작 시각 입력을 제공한다(기본 날짜 시드, 기본 시작 10:00)', () => {
    renderSheet()
    const date = screen.getByDisplayValue('2026-06-20') as HTMLInputElement
    expect(date.type).toBe('date')
    const time = screen.getByDisplayValue('10:00') as HTMLInputElement
    expect(time.type).toBe('time')
  })

  it('buildCoursePlan stop 시각으로 타임라인을 렌더한다(첫 stop 10:00)', () => {
    renderSheet()
    const timeline = screen.getByRole('list', { name: '동선 타임라인' })
    // 기본 시작 10:00 → 첫 stop 도착 10:00.
    expect(within(timeline).getByText('10:00')).toBeInTheDocument()
  })

  it('취소 버튼은 onCancel을 부른다', () => {
    const onCancel = vi.fn()
    renderSheet({ onCancel })
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('확인 버튼은 recompute된 plan으로 onConfirm({stops,dayKeyStr,startMin})을 부른다', () => {
    const onConfirm = vi.fn<(v: { stops: CourseStop[]; dayKeyStr: string; startMin: number }) => void>()
    renderSheet({ onConfirm })
    fireEvent.click(screen.getByRole('button', { name: /함께 캘린더에 추가/ }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const arg = onConfirm.mock.calls[0]![0]
    expect(arg.dayKeyStr).toBe('2026-06-20')
    expect(arg.startMin).toBe(600)
    expect(arg.stops).toHaveLength(2)
  })

  it('시작 시각 변경 시 첫 stop 시각이 재계산된다', () => {
    renderSheet()
    const time = screen.getByDisplayValue('10:00') as HTMLInputElement
    fireEvent.change(time, { target: { value: '13:00' } })
    const timeline = screen.getByRole('list', { name: '동선 타임라인' })
    expect(within(timeline).getByText('13:00')).toBeInTheDocument()
    expect(within(timeline).queryByText('10:00')).toBeNull()
  })

  it('busy면 확인 버튼이 disabled(중복 추가 방지)', () => {
    renderSheet({ busy: true })
    expect(screen.getByRole('button', { name: /추가 중/ })).toBeDisabled()
  })
})
