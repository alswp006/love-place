import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'
import styles from './EmptyState.module.css'

// 친근한 빈 상태 + 행동 유도(§8 / ux-and-accessibility.md §7). 죽은 화면 금지.
//
// 이모지 → 아이콘: OS·버전마다 이모지 모양이 달라 통제가 안 되고, 한 화면에서 탭바(SVG)와
// 두 체계가 섞여 보였다. 세트 하나로 통일한다.
type Props = {
  icon: IconName
  title: string
  hint?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, hint, action }: Props) {
  return (
    <div className={styles.empty}>
      <div className={styles.emoji} aria-hidden>
        <Icon name={icon} />
      </div>
      <p className={styles.title}>{title}</p>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  )
}
