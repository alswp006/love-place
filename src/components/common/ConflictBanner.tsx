import styles from './ConflictBanner.module.css'

// 동시편집 충돌 알림(§4.3) — LWW 무음 덮어쓰기 대신 사용자에게 표시. aria-live로 스크린리더 안내.
export function ConflictBanner({ message, onDismiss }: { message?: string; onDismiss: () => void }) {
  return (
    <div className={styles.banner} role="alert" aria-live="assertive">
      <span className={styles.icon} aria-hidden>
        ⚠️
      </span>
      <span className={styles.text}>
        {message ?? '상대가 먼저 수정했어요. 최신 내용으로 새로고침했어요.'}
      </span>
      <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="알림 닫기">
        ✕
      </button>
    </div>
  )
}
