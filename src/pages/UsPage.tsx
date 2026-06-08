import { useState } from 'react'
import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { useAuth } from '@/state/auth'
import { useSignOut } from '@/hooks/useSignOut'
import { useCouple } from '@/hooks/useCouple'
import { useDisconnectCouple } from '@/hooks/useCoupleInvite'
import { tabByPath } from '@/app/tabs'
import styles from './UsPage.module.css'

// 💑 우리 — 프로필·연결·내보내기(§3, §10). 연결 후 상대 표시 + 연결 해제.
export default function UsPage() {
  const tab = tabByPath('/us')
  const { user } = useAuth()
  const signOut = useSignOut()
  const { data: couple } = useCouple()
  const disconnect = useDisconnectCouple()
  const [confirming, setConfirming] = useState(false)

  const partner = couple?.partner
  const connectedDate = couple?.connectedAt
    ? new Date(couple.connectedAt).toLocaleDateString('ko-KR')
    : null

  const onDisconnect = () => {
    if (!couple?.coupleId) return
    disconnect.mutate(couple.coupleId, {
      onSettled: () => setConfirming(false),
    })
  }

  return (
    <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
      <div className={styles.container}>
        {/* 연결된 상대 */}
        {partner ? (
          <section className={styles.card} aria-label="연결된 상대">
            <div className={styles.partnerRow}>
              <div className={styles.avatar} style={{ background: partner.color }} aria-hidden>
                {partner.displayName.slice(0, 1).toUpperCase() || '💑'}
              </div>
              <div className={styles.partnerInfo}>
                <span className={styles.partnerName}>{partner.displayName || '상대'}</span>
                <span className={styles.partnerMeta}>
                  {connectedDate ? `${connectedDate}부터 연결됨` : '연결됨'}
                </span>
              </div>
            </div>
          </section>
        ) : null}

        {/* 내 계정 */}
        <section className={styles.card} aria-label="내 계정">
          <div className={styles.row}>
            <span className={styles.label}>로그인</span>
            <span className={styles.value}>{user?.email}</span>
          </div>
          <button className={styles.ghostBtn} type="button" onClick={() => void signOut()}>
            로그아웃
          </button>
        </section>

        {/* 연결 해제 */}
        {couple?.status === 'ACTIVE' ? (
          <section className={styles.card} aria-label="연결 관리">
            {confirming ? (
              <div className={styles.confirm} role="dialog" aria-label="연결 해제 확인">
                <p className={styles.confirmText}>
                  연결을 해제하면 새 공유 기록 추가가 중단돼요. 기존 기록은 남습니다. 정말 해제할까요?
                </p>
                <div className={styles.confirmActions}>
                  <button className={styles.ghostBtn} onClick={() => setConfirming(false)}>
                    취소
                  </button>
                  <button
                    className={styles.dangerBtn}
                    onClick={onDisconnect}
                    disabled={disconnect.isPending}
                  >
                    {disconnect.isPending ? '해제 중…' : '연결 해제'}
                  </button>
                </div>
              </div>
            ) : (
              <button className={styles.dangerGhost} onClick={() => setConfirming(true)}>
                연결 해제
              </button>
            )}
          </section>
        ) : null}
      </div>
    </ScreenScaffold>
  )
}
