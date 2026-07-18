import { useState } from 'react'
import { useConsent } from '@/hooks/useConsent'
import { useJourneyRecording } from '@/hooks/useJourneyRecording'
import { useToast } from '@/components/common/ToastProvider'
import { Button } from '@/components/ui/Button'
import { RecordingBadge } from './RecordingBadge'
import { ConsentSheet } from './ConsentSheet'
import styles from './JourneyRecordControl.module.css'

// 지도 위 "여행 동선 시작/종료"(A안 — 마찰 최소: 만나서 바로 시작, trip_id 없이 기록 → 나중에 연결).
// 동의 없으면 그 자리에서 ConsentSheet를 연다(탭 이동 강제 금지 — 마찰 최소 원칙).
// 기록 중엔 RecordingBadge(일시중지/재개/종료).
type Props = { coupleId: string | null; userId: string | null }

export function JourneyRecordControl({ coupleId, userId }: Props) {
  const consent = useConsent(coupleId, userId)
  // A안: trip_id=null로 시작(고아 세션). 종료 후 '우리' 탭에서 여행에 연결.
  const rec = useJourneyRecording(coupleId, userId, null, { canRecord: consent.canRecord })
  const toast = useToast()
  const [consentOpen, setConsentOpen] = useState(false)

  if (!coupleId) return null

  const onStart = async () => {
    try {
      await rec.start()
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '동선 기록을 시작하지 못했어요.')
    }
  }
  const onEnd = async () => {
    try {
      await rec.end()
      toast.show('동선이 저장됐어요. ‘우리’ 탭에서 여행에 연결하세요.')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '동선 저장에 실패했어요.')
    }
  }

  if (rec.status !== 'idle') {
    return (
      <div className={styles.wrap}>
        <RecordingBadge
          status={rec.isPaused ? 'PAUSED' : 'RECORDING'}
          onPause={() => void rec.pause()}
          onResume={() => void rec.resume()}
          onStop={() => void onEnd()}
        />
      </div>
    )
  }

  if (!consent.canRecord) {
    return (
      <div className={styles.wrap}>
        <button
          type="button"
          className={styles.consentLink}
          onClick={() => setConsentOpen(true)}
        >
          📍 위치 동의하고 동선 기록하기 →
        </button>
        <ConsentSheet
          open={consentOpen}
          onClose={() => setConsentOpen(false)}
          coupleId={coupleId}
          userId={userId}
        />
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <Button variant="primary" className={styles.startBtn} onClick={() => void onStart()}>
        ● 여행 동선 시작
      </Button>
    </div>
  )
}
