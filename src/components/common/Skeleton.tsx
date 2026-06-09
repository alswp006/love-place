import styles from './Skeleton.module.css'

// 로딩 스켈레톤(§7 — 죽은 회색 박스 X, 구조를 가진 시머).
// role=status(aria-live polite)로 스크린리더에 로딩을 알리고, Reduce Motion에선 시머 정지.
type Props = { count?: number; label?: string }

export function Skeleton({ count = 3, label = '불러오는 중' }: Props) {
  return (
    <div className={styles.wrap} role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={styles.row} aria-hidden>
          <div className={styles.lineWide} />
          <div className={styles.lineNarrow} />
        </div>
      ))}
    </div>
  )
}
