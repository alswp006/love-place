import styles from './RouteFallback.module.css'

// 페이지 코드 스플리팅 로딩 폴백(스켈레톤 — 빈 회색 박스 금지, §8 로딩 디테일).
export function RouteFallback() {
  return (
    <div className={styles.wrap} role="status" aria-live="polite" aria-label="불러오는 중">
      <div className={styles.bar} style={{ width: '40%' }} />
      <div className={styles.card} />
      <div className={styles.card} />
    </div>
  )
}
