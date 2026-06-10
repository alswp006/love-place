import { useOfflineQueue } from '@/state/OfflineQueueProvider'
import styles from './OfflineQueueBadge.module.css'

// 오프라인/동기화 상태 배지(D2 — 01-spec.md:17). 온라인·대기0·충돌0이면 숨김.
export function OfflineQueueBadge() {
  const { online, pending, flushConflicts, clearConflicts } = useOfflineQueue()
  if (online && pending === 0 && flushConflicts === 0) return null

  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      {!online ? (
        <span className={styles.offline}>
          📴 오프라인{pending > 0 ? ` · ${pending}건 대기` : ''} — 연결되면 동기화돼요
        </span>
      ) : pending > 0 ? (
        <span className={styles.syncing}>🔄 동기화 중 {pending}건…</span>
      ) : null}
      {flushConflicts > 0 ? (
        <span className={styles.conflict}>
          ⚠️ {flushConflicts}건 충돌 — 최신으로 맞췄어요
          <button type="button" className={styles.dismiss} onClick={clearConflicts} aria-label="충돌 알림 닫기">
            ✕
          </button>
        </span>
      ) : null}
    </div>
  )
}
