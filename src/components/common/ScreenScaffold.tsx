import type { ReactNode } from 'react'
import styles from './ScreenScaffold.module.css'

// 모든 탭 화면의 공통 골격: 라지 타이틀 + 콘텐츠. 시맨틱 HTML(접근성 §8).
// fullBleed=true: 지도 화면용 — 시각적 헤더(타이틀/부제)와 본문 패딩을 생략하되
// data-testid는 유지(라우팅 테스트 page-map 보존)하고 section에 aria-label로 접근성 이름을 남긴다.
type Props = {
  title: string
  subtitle?: string
  children?: ReactNode
  testId?: string
  fullBleed?: boolean
}

export function ScreenScaffold({ title, subtitle, children, testId, fullBleed = false }: Props) {
  if (fullBleed) {
    return (
      <section className={styles.fullBleed} data-testid={testId} aria-label={title}>
        {children}
      </section>
    )
  }
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
