import styles from './Toast.module.css'

// 가벼운 토스트(액션 피드백). aria-live로 스크린리더 안내. 상태는 hooks/useToast.ts.
export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null
  return (
    <div className={styles.toast} role="status" aria-live="polite">
      {msg}
    </div>
  )
}
