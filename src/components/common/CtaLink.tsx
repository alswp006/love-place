import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './CtaLink.module.css'

// 빈 상태의 행동 유도 버튼(§7 — 죽은 화면 대신 "다음 한 걸음"을 제시).
// 터치 타깃 ≥44px(HIG §1), 포커스 가시(:focus-visible 전역), Reduce Motion 토큰 전환.
type Props = { to: string; children: ReactNode }

export function CtaLink({ to, children }: Props) {
  return (
    <Link to={to} className={styles.cta}>
      {children}
    </Link>
  )
}
