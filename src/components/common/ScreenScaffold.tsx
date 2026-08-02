import type { ReactNode } from 'react'
import styles from './ScreenScaffold.module.css'

// 모든 탭 화면의 공통 골격: 라지 타이틀 + 콘텐츠. 시맨틱 HTML(접근성 §8).
// fullBleed=true: 지도 화면용 — 시각적 헤더(타이틀/부제)와 본문 패딩을 생략하되
// data-testid는 유지(라우팅 테스트 page-map 보존)하고 section에 aria-label로 접근성 이름을 남긴다.
// headerHidden=true: 캘린더처럼 화면 자체가 세로 공간을 다 써야 하는 경우 — 본문 패딩은 유지하고
// 시각적 헤더만 뺀다. 화면 이름은 aria-label로 남아 스크린리더는 계속 읽는다(접근성 회귀 없음).
type Props = {
  title: string
  subtitle?: string
  children?: ReactNode
  testId?: string
  fullBleed?: boolean
  headerHidden?: boolean
}

export function ScreenScaffold({
  title,
  subtitle,
  children,
  testId,
  fullBleed = false,
  headerHidden = false,
}: Props) {
  if (fullBleed) {
    return (
      <section className={styles.fullBleed} data-fullbleed data-testid={testId} aria-label={title}>
        {children}
      </section>
    )
  }
  if (headerHidden) {
    return (
      <section className={styles.screen} data-testid={testId} aria-label={title}>
        <div className={styles.body}>{children}</div>
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
