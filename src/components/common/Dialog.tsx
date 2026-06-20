import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import styles from './Dialog.module.css'

type DialogProps = {
  open: boolean
  onClose: () => void
  ariaLabel: string
  initialFocusRef?: RefObject<HTMLElement | null>
  className?: string
  children: ReactNode
}

const FOCUSABLE = 'button, input, textarea, select, [href], [tabindex]:not([tabindex="-1"])'

// 공용 모달 프리미티브 — 포털 + 백드롭 + 포커스 트랩 + ESC + 복귀 포커스(EventSheet 패턴 일원화, §8 a11y).
export function Dialog({ open, onClose, ariaLabel, initialFocusRef, className, children }: DialogProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)

  // 열릴 때: 직전 포커스 저장 후 초기 포커스. 닫힐 때(언마운트): 직전 포커스 복귀.
  useEffect(() => {
    if (!open) return
    prevFocusRef.current = (document.activeElement as HTMLElement | null) ?? null
    const focusTarget =
      initialFocusRef?.current ??
      sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
      sheetRef.current
    focusTarget?.focus()
    return () => {
      prevFocusRef.current?.focus()
    }
  }, [open, initialFocusRef])

  // ESC 닫기(window 리스너, cleanup).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  const trapTab = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab' || !sheetRef.current) return
    const els = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => !el.hasAttribute('disabled'),
    )
    if (els.length === 0) return
    const first = els[0]!
    const last = els[els.length - 1]!
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={sheetRef}
        className={className ? `${styles.sheet} ${className}` : styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapTab}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
