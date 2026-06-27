import { Button } from '@/components/ui/Button'
import styles from './RecordingBadge.module.css'

// 동선 "기록 중" 인디케이터 — 색만 의존 금지(점 아이콘+텍스트 라벨+aria-live), 즉시 중지/일시중지 항상 노출(제24조2).
type Props = {
  status: 'RECORDING' | 'PAUSED'
  onPause: () => void
  onResume: () => void
  onStop: () => void
}

export function RecordingBadge({ status, onPause, onResume, onStop }: Props) {
  const recording = status === 'RECORDING'
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <span
        className={recording ? styles.dotRecording : styles.dotPaused}
        aria-hidden
      />
      <span className={styles.label}>{recording ? '기록 중' : '일시중지됨'}</span>
      <div className={styles.actions}>
        {recording ? (
          <Button variant="ghost" className={styles.btn} onClick={onPause} aria-label="동선 기록 일시중지">
            ⏸ 일시중지
          </Button>
        ) : (
          <Button variant="ghost" className={styles.btn} onClick={onResume} aria-label="동선 기록 재개">
            ▶ 재개
          </Button>
        )}
        <Button variant="ghost" className={styles.stop} onClick={onStop} aria-label="동선 기록 종료">
          ⏹ 종료
        </Button>
      </div>
    </div>
  )
}
