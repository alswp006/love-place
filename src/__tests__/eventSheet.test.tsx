import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Task 5(R2): EventSheet 시간 검증 + 인라인 에러(role="alert") + 입력 보존.
// buildEventTimes(Task 1)로 검증해서, 동일 시각/역전 범위면 onCreate/onUpdate에 도달하지 않고
// 인라인 에러를 띄우고 로컬 입력(제목)을 보존한다. 고친 뒤 저장하면 정상 페이로드(start<end)가 나간다.
import { EventSheet } from '@/components/calendar/EventSheet'

function setup(overrides: Partial<Parameters<typeof EventSheet>[0]> = {}) {
  const onCreate = vi.fn()
  const onUpdate = vi.fn()
  const onDelete = vi.fn()
  const onClose = vi.fn()
  render(
    <EventSheet
      initial={null}
      defaultDate="2026-06-20"
      myId="u1"
      busy={false}
      profiles={{}}
      onClose={onClose}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
      {...overrides}
    />,
  )
  return { onCreate, onUpdate, onDelete, onClose }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EventSheet 시간 검증·인라인 에러·입력 보존(R2, Task 5)', () => {
  it('시작=종료면 onCreate 미호출 + 인라인 에러(role="alert") + 제목 보존', () => {
    const { onCreate } = setup()
    // 종일 해제(기본 false라 이미 시간 입력이 보이지만, 명시적으로 유지)
    fireEvent.change(screen.getByLabelText('일정 제목'), { target: { value: '데이트' } })
    fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '10:00' } })
    fireEvent.change(screen.getByLabelText('종료 시각'), { target: { value: '10:00' } })

    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(onCreate).not.toHaveBeenCalled()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/시작.*종료 시간이 같아요/)
    // 입력 보존: 제목은 그대로 남아있다.
    expect(screen.getByLabelText('일정 제목')).toHaveValue('데이트')
  })

  it('에러 후 종료 시각을 고치면 onCreate가 1회 호출되고 payload는 start<end', () => {
    const { onCreate } = setup()
    fireEvent.change(screen.getByLabelText('일정 제목'), { target: { value: '데이트' } })
    fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '10:00' } })
    fireEvent.change(screen.getByLabelText('종료 시각'), { target: { value: '10:00' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(onCreate).not.toHaveBeenCalled()

    // 종료를 12:00으로 고친 뒤 저장
    fireEvent.change(screen.getByLabelText('종료 시각'), { target: { value: '12:00' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(onCreate).toHaveBeenCalledTimes(1)
    const payload = onCreate.mock.calls[0]![0]
    expect(payload.title).toBe('데이트')
    expect(new Date(payload.start).getTime()).toBeLessThan(new Date(payload.end).getTime())
    // 에러는 사라진다.
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
