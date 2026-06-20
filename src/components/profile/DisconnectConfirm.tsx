import { useState, type RefObject } from 'react'
import styles from '@/pages/UsPage.module.css'

type Props = {
  exporting: boolean
  exported: boolean
  onExportZip: () => void
  onDisconnect: () => void
  onCancel: () => void
  disconnectPending: boolean
  cancelRef: RefObject<HTMLButtonElement>
}

// 연결 해제 다이얼로그 본문 — 정직 카피 + 해제 전 내보내기 필수 게이트(§10.4, security-privacy §5.1).
// 양측은 각자 내보낸 사본을 보유하고, 공유 행은 ACTIVE-only RLS로 잠긴다("누가 무엇을 보관").
export function DisconnectConfirm({
  exporting,
  exported,
  onExportZip,
  onDisconnect,
  onCancel,
  disconnectPending,
  cancelRef,
}: Props) {
  const [ack, setAck] = useState(false)

  return (
    <div className={styles.confirm}>
      <p className={styles.confirmText}>
        연결을 해제하면 공유 기록은 <strong>더는 이 앱에서 볼 수 없게</strong> 돼요(해제 후에는 직접 내보낼 수도
        없어요). 공유 데이터는 양쪽 누구도 새로 추가/수정할 수 없게 잠깁니다.
        <br />
        그러니 <strong>해제 전에 반드시</strong> 데이터를 내보내 두세요. 내보낸 사본은 두 사람이 각자 보관합니다.
      </p>
      <button type="button" className={styles.ghostBtn} onClick={onExportZip} disabled={exporting}>
        {exporting ? '내보내는 중…' : '지금 ZIP 내보내기'}
      </button>
      <label className={styles.ack}>
        <input type="checkbox" checked={ack} disabled={!exported} onChange={(e) => setAck(e.target.checked)} />
        내보낸 파일을 받았어요
      </label>
      <div className={styles.confirmActions}>
        <button ref={cancelRef} type="button" className={styles.ghostBtn} onClick={onCancel}>
          취소
        </button>
        <button
          className={styles.dangerBtn}
          onClick={onDisconnect}
          disabled={!exported || !ack || disconnectPending}
        >
          {disconnectPending ? '해제 중…' : '연결 해제'}
        </button>
      </div>
    </div>
  )
}
