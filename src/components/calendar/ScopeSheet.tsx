import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import styles from './ScopeSheet.module.css'

// 반복 일정 범위 선택 시트(R2.3) — occurrence를 편집/삭제할 때 적용 범위를 묻는다.
// '이 일정만'=EXDATE(+override), '이후 모두'=시리즈 분할, '전체'=시리즈 plain update/softDelete.
// 비반복이면 부모가 시트 없이 직접 적용하므로 이 컴포넌트는 렌더되지 않는다.
export type Scope = 'this' | 'following' | 'all'

type Props = {
  mode: 'edit' | 'delete'
  onPick: (scope: Scope) => void
  onCancel: () => void
}

export function ScopeSheet({ mode, onPick, onCancel }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef<HTMLButtonElement>(null)
  const verb = mode === 'delete' ? '삭제' : '수정'

  useEffect(() => {
    firstRef.current?.focus()
  }, [])

  // ESC로 닫기(취소 대체 경로, §8 — 제스처/버튼 단독 의존 금지).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // 포커스 트랩(§8) — Tab이 시트 밖으로 새지 않게 첫/마지막 포커서블을 순환.
  const trapTab = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab' || !sheetRef.current) return
    const els = Array.from(sheetRef.current.querySelectorAll<HTMLElement>('button')).filter(
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

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={`반복 일정 ${verb} 범위`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapTab}
      >
        <p className={styles.title}>이 반복 일정을 어디까지 {verb}할까요?</p>
        <div className={styles.options}>
          <button ref={firstRef} type="button" className={styles.option} onClick={() => onPick('this')}>
            이 일정만
          </button>
          <button type="button" className={styles.option} onClick={() => onPick('following')}>
            이후 모두
          </button>
          <button type="button" className={styles.option} onClick={() => onPick('all')}>
            전체
          </button>
        </div>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  )
}
