import { describe, it, expect, vi } from 'vitest'
import { useRef } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { Dialog } from '@/components/common/Dialog'

// 공용 Dialog 프리미티브 — 포털 + 백드롭 + 포커스 트랩 + ESC + 복귀 포커스(§8 a11y).
describe('Dialog (포털 · 백드롭 · 포커스트랩 · ESC · 복귀포커스, R3)', () => {
  it('(a) document.body 포털로 role=dialog · aria-modal · aria-label을 렌더', () => {
    render(
      <Dialog open onClose={() => {}} ariaLabel="테스트 다이얼로그">
        <button type="button">확인</button>
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', '테스트 다이얼로그')
    // 셸(컴포넌트 루트) 밖, document.body 바로 아래에 포털된다.
    expect(document.body.contains(dialog)).toBe(true)
  })

  it('open=false면 아무것도 렌더하지 않는다', () => {
    render(
      <Dialog open={false} onClose={() => {}} ariaLabel="닫힘">
        <button type="button">확인</button>
      </Dialog>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('(b) ESC → onClose 호출', () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose} ariaLabel="esc">
        <button type="button">확인</button>
      </Dialog>,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('(c) 백드롭 클릭 → onClose, 시트 내부 클릭은 닫지 않음', () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose} ariaLabel="backdrop">
        <button type="button">확인</button>
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog')
    // 시트 내부 클릭(버블링이 backdrop까지 가지만 stopPropagation으로 막힘)
    fireEvent.click(dialog)
    expect(onClose).not.toHaveBeenCalled()
    // 백드롭(시트의 부모) 클릭
    fireEvent.click(dialog.parentElement as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('(d) Tab: 마지막 포커서블 → 첫번째 순환, Shift+Tab: 첫번째 → 마지막 순환', () => {
    render(
      <Dialog open onClose={() => {}} ariaLabel="trap">
        <button type="button">first</button>
        <button type="button">last</button>
      </Dialog>,
    )
    const first = screen.getByRole('button', { name: 'first' })
    const last = screen.getByRole('button', { name: 'last' })
    const dialog = screen.getByRole('dialog')

    last.focus()
    expect(document.activeElement).toBe(last)
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    first.focus()
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('(e) 열릴 때 initialFocusRef로 포커스 이동', () => {
    function Wrapper() {
      const ref = useRef<HTMLButtonElement>(null)
      return (
        <Dialog open onClose={() => {}} ariaLabel="initial" initialFocusRef={ref}>
          <button type="button">기타</button>
          <button type="button" ref={ref}>
            지정 포커스
          </button>
        </Dialog>
      )
    }
    render(<Wrapper />)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '지정 포커스' }))
  })

  it('(f) 언마운트 시 열기 직전 포커스 요소로 복귀', () => {
    function Wrapper({ open }: { open: boolean }) {
      return (
        <>
          <button type="button">트리거</button>
          <Dialog open={open} onClose={() => {}} ariaLabel="restore">
            <button type="button">확인</button>
          </Dialog>
        </>
      )
    }
    const { rerender } = render(<Wrapper open={false} />)
    const trigger = screen.getByRole('button', { name: '트리거' })
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    rerender(<Wrapper open />)
    // 다이얼로그가 포커스를 가져감
    expect(document.activeElement).not.toBe(trigger)

    rerender(<Wrapper open={false} />)
    // 닫히면(언마운트) 트리거로 복귀
    expect(document.activeElement).toBe(trigger)
  })
})
