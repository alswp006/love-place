import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { QuickAddRow } from '@/components/calendar/QuickAddRow'
import { dayKey } from '@/lib/calendar/eventDays'
import type { NewEvent } from '@/hooks/useEventMutations'

// 한 줄 추가(투두메이트식) — 제목만 + 엔터, 포커스 유지로 연속 입력.
const onCreate = vi.fn<(e: NewEvent, done: () => void) => void>()

beforeEach(() => {
  onCreate.mockReset()
})

function renderRow(dateKey = '2026-07-25') {
  render(<QuickAddRow dateKey={dateKey} onCreate={onCreate} />)
  return screen.getByLabelText(`${dateKey}에 할 일 추가`) as HTMLInputElement
}

describe('QuickAddRow', () => {
  it('제목만 넣고 엔터 → 그 날짜의 종일 PERSONAL(나만) 이벤트', () => {
    const input = renderRow()
    fireEvent.change(input, { target: { value: '숙소 예약하기' } })
    fireEvent.submit(input.form!)

    expect(onCreate).toHaveBeenCalledOnce()
    const [ev] = onCreate.mock.calls[0]!
    expect(ev.title).toBe('숙소 예약하기')
    expect(ev.isAllDay).toBe(true)
    // 공유가 기본값(§1) — 개인 일정으로 돌리는 건 EventSheet의 몫.
    // 한 줄 추가는 '내 할 일'을 적는 자리라 기본이 나만이다(함께는 상세에서 바꾼다).
    expect(ev.visibility).toBe('PERSONAL')
    // 표시 tz 기준으로 그 날짜 버킷에 떨어져야 한다(다음 날로 새면 안 됨).
    expect(dayKey(ev.start)).toBe('2026-07-25')
    expect(dayKey(ev.end)).toBe('2026-07-25')
  })

  it('성공(done) 후 입력만 비우고 포커스를 유지한다 — 연속 입력', () => {
    const input = renderRow()
    fireEvent.change(input, { target: { value: '첫 번째' } })
    fireEvent.submit(input.form!)

    // 아직 done을 부르기 전에는 입력값이 남아 있다(낙관적으로 비우지 않는다).
    expect(input.value).toBe('첫 번째')

    const done = onCreate.mock.calls[0]![1]
    act(() => done())

    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
  })

  it('실패해서 done이 안 불리면 입력값을 보존한다(§7 입력값 보존)', () => {
    const input = renderRow()
    fireEvent.change(input, { target: { value: '날리면 안 되는 값' } })
    fireEvent.submit(input.form!)
    // done 미호출 = 실패 경로
    expect(input.value).toBe('날리면 안 되는 값')
  })

  it('빈 문자열·공백만이면 만들지 않는다', () => {
    const input = renderRow()
    fireEvent.submit(input.form!)
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(input.form!)
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('제목 앞뒤 공백은 잘라서 저장한다', () => {
    const input = renderRow()
    fireEvent.change(input, { target: { value: '  여권 챙기기  ' } })
    fireEvent.submit(input.form!)
    expect(onCreate.mock.calls[0]![0].title).toBe('여권 챙기기')
  })

  it('엔터 주 경로 외에 버튼 대체 경로도 있다(제스처 전용 금지 — ux §1)', () => {
    const input = renderRow()
    // 비어 있으면 버튼을 아예 렌더하지 않는다 — 쉬는 상태의 글자를 '＋ 할 일 입력'으로 줄이기 위해서다.
    // (누를 이유가 없는 버튼을 비활성으로 남겨두던 것을 없앴다. 대체 경로 자체는 아래처럼 살아 있다.)
    expect(screen.queryByRole('button', { name: '추가' })).toBeNull()
    fireEvent.change(input, { target: { value: '짐 싸기' } })
    const btn = screen.getByRole('button', { name: '추가' })
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    expect(onCreate).toHaveBeenCalledOnce()
  })

  it('ESC로 입력을 비운다', () => {
    const input = renderRow()
    fireEvent.change(input, { target: { value: '취소할 것' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.value).toBe('')
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('응답 전 중복 제출을 막는다', () => {
    const input = renderRow()
    fireEvent.change(input, { target: { value: '한 번만' } })
    fireEvent.submit(input.form!)
    fireEvent.submit(input.form!)
    expect(onCreate).toHaveBeenCalledOnce()
  })
})
