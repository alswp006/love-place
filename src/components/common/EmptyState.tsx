import type { ReactNode } from 'react'
import styles from './EmptyState.module.css'

// 친근한 빈 상태 + 행동 유도(§8 / ux-and-accessibility.md §7). 죽은 화면 금지.
type Props = {
  emoji: string
  title: string
  hint?: string
  action?: ReactNode
}

export function EmptyState({ emoji, title, hint, action }: Props) {
  return (
    <div className={styles.empty}>
      <div className={styles.emoji} aria-hidden>
        {emoji}
      </div>
      <p className={styles.title}>{title}</p>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  )
}
