import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Task 9(R2): EventSheet 스와이프 다운 닫기 + reduce-motion 전환 축소.
// 시트 드래그 핸들에서 touchstart(y=100)→touchmove(y=260, 임계 초과)→touchend 시 onClose 호출.
// 임계 미만(y=110)은 닫히지 않음(스냅백). 버튼/Esc 대체 경로는 유지(발견성 — 제스처 단독 금지).
// reduce-motion 분기는 CSS(@media)라 e2e에서 시각 확인; 단위는 제스처 핸들러만 검증.
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

// jsdom Touch 합성: clientY만 있으면 충분.
function touch(clientY: number) {
  return { clientY } as Touch
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EventSheet 스와이프 다운 닫기(R2, Task 9)', () => {
  it('핸들에서 임계 초과(100→260) 스와이프 다운 시 onClose 호출', () => {
    const { onClose } = setup()
    const handle = screen.getByTestId('sheet-handle')
    fireEvent.touchStart(handle, { touches: [touch(100)] })
    fireEvent.touchMove(handle, { touches: [touch(260)] })
    fireEvent.touchEnd(handle, {})
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('임계 미만(100→110) 스와이프는 닫히지 않음(스냅백)', () => {
    const { onClose } = setup()
    const handle = screen.getByTestId('sheet-handle')
    fireEvent.touchStart(handle, { touches: [touch(100)] })
    fireEvent.touchMove(handle, { touches: [touch(110)] })
    fireEvent.touchEnd(handle, {})
    expect(onClose).not.toHaveBeenCalled()
  })

  it('버튼 대체 경로 유지: 취소 버튼 클릭 시 onClose', () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Esc 대체 경로 유지', () => {
    const { onClose } = setup()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
