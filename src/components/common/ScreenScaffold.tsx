import type { ReactNode } from 'react'
import styles from './ScreenScaffold.module.css'

// 모든 탭 화면의 공통 골격: 라지 타이틀 + 콘텐츠. 시맨틱 HTML(접근성 §8).
type Props = {
  title: string
  subtitle?: string
  children?: ReactNode
  testId?: string
}

export function ScreenScaffold({ title, subtitle, children, testId }: Props) {
  return (
    <section className={styles.screen} data-testid={testId}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  )
}
