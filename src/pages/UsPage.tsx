import { useState, useRef } from 'react'
import { daysTogether, partnerLabel } from '@/lib/partner'
import { getNickname, setNickname } from '@/state/nickname'
import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { Dialog } from '@/components/common/Dialog'
import { useAuth } from '@/state/auth'
import { useSignOut } from '@/hooks/useSignOut'
import { useCouple } from '@/hooks/useCouple'
import { useDisconnectCouple } from '@/hooks/useCoupleInvite'
import { fetchCoupleExport, fetchPhotoBlobs, downloadJson, downloadBlob } from '@/lib/export/dumpSchema'
import { buildExportZip } from '@/lib/export/buildZip'
import { dayKey } from '@/lib/calendar/eventDays'
import { tabByPath } from '@/app/tabs'
import { TrashSection } from '@/components/places/TrashSection'
import { useTrashPlaces, useRestorePlace } from '@/hooks/usePlaceTrash'
import { useConflict } from '@/lib/sync/useConflict'
import { ConflictBanner } from '@/components/common/ConflictBanner'
import { ProfileEditor } from '@/components/profile/ProfileEditor'
import { DisconnectConfirm } from '@/components/profile/DisconnectConfirm'
import styles from './UsPage.module.css'

// 💑 우리 — 프로필·연결·내보내기(§3, §10). 연결 후 상대 표시 + 연결 해제.
export default function UsPage() {
  const tab = tabByPath('/us')
  const { user } = useAuth()
  const signOut = useSignOut()
  const { data: couple } = useCouple()
  const disconnect = useDisconnectCouple()
  const [confirming, setConfirming] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exported, setExported] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const myId = user?.id ?? null
  const conflict = useConflict()
  const [trashOpen, setTrashOpen] = useState(false)
  const { data: trash } = useTrashPlaces(couple?.coupleId ?? null, trashOpen)
  const { restorePlace, isPending: restorePending } = useRestorePlace(
    couple?.coupleId ?? null,
    myId,
    conflict.flag,
  )

  // 내보내기 v0(§10.4 회수권) — 내 커플 데이터 전체를 JSON으로 다운로드.
  const onExport = async () => {
    if (!couple?.coupleId) return
    setExporting(true)
    setExportError(null)
    try {
      const data = await fetchCoupleExport(couple.coupleId)
      downloadJson(`love_place_${dayKey(new Date().toISOString())}.json`, data)
      setExported(true)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : '내보내기에 실패했어요.')
    } finally {
      setExporting(false)
    }
  }

  // ZIP 내보내기(§10.4 회수권) — JSON 봉투 + 원본 사진 blob을 묶어 다운로드. 양측 동등(RLS 대칭).
  const onExportZip = async () => {
    if (!couple?.coupleId) return
    setExporting(true)
    setExportError(null)
    try {
      const data = await fetchCoupleExport(couple.coupleId)
      const photoRows = (data.tables.photos as { id: string; storage_url: string }[]) ?? []
      const blobs = await fetchPhotoBlobs(couple.coupleId, photoRows)
      const zip = buildExportZip(data, blobs)
      downloadBlob(`love_place_${dayKey(new Date().toISOString())}.zip`, zip)
      setExported(true)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : '내보내기에 실패했어요.')
    } finally {
      setExporting(false)
    }
  }

  const partner = couple?.partner
  const connectedDate = couple?.connectedAt
    ? new Date(couple.connectedAt).toLocaleDateString('ko-KR')
    : null
  // 상대 표시명: display_name 비면 로컬 별명(내 기기에만) → '상대'. 함께한 지 D+N(dossier 02 §4).
  const [nick, setNick] = useState<string | null>(() =>
    partner ? getNickname(partner.id) : null,
  )
  const [nickDraft, setNickDraft] = useState('')
  const days = daysTogether(couple?.connectedAt ?? null)
  const onSaveNick = () => {
    if (!partner) return
    const v = nickDraft.trim()
    setNickname(partner.id, v)
    setNick(v || null)
    setNickDraft('')
  }

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
              {partner.avatarUrl ? (
                <img
                  className={styles.avatar}
                  src={partner.avatarUrl}
                  alt=""
                  aria-hidden
                />
              ) : (
                <div className={styles.avatar} style={{ background: partner.color }} aria-hidden>
                  {partner.displayName.slice(0, 1).toUpperCase() || '💑'}
                </div>
              )}
              <div className={styles.partnerInfo}>
                <span className={styles.partnerName}>{partnerLabel(partner, nick)}</span>
                <span className={styles.partnerMeta}>
                  {days !== null
                    ? `함께한 지 D+${days}`
                    : connectedDate
                      ? `${connectedDate}부터 연결됨`
                      : '연결됨'}
                </span>
              </div>
            </div>
            {/* display_name 빈값일 때만 내 기기 별명 — 공유 X(로컬), 색+이름 라벨 보조(§8) */}
            {!partner.displayName.trim() ? (
              <div className={styles.nickRow}>
                <input
                  className={styles.nickInput}
                  type="text"
                  value={nickDraft}
                  onChange={(e) => setNickDraft(e.target.value)}
                  placeholder="별명 정하기"
                  aria-label="상대 별명"
                  maxLength={20}
                />
                <button
                  className={styles.ghostBtn}
                  type="button"
                  onClick={onSaveNick}
                  disabled={!nickDraft.trim()}
                >
                  저장
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* 내 계정 */}
        <section className={styles.card} aria-label="내 계정">
          <div className={styles.row}>
            <span className={styles.label}>로그인</span>
            <span className={styles.value}>{user?.email}</span>
          </div>
          {/* 내 프로필(이름·색) 편집 — 색+라벨 이중화(§8), 낙관적 락 저장(Task 6/7) */}
          {couple?.coupleId ? <ProfileEditor coupleId={couple.coupleId} /> : null}
          <button className={styles.ghostBtn} type="button" onClick={() => void signOut()}>
            로그아웃
          </button>
        </section>

        {/* 내보내기(§10.4 회수권) — 둘 다 동등하게 내 커플 데이터 전체를 가져갈 수 있다 */}
        {couple?.coupleId ? (
          <section className={styles.card} aria-label="데이터 내보내기">
            <div className={styles.row}>
              <span className={styles.label}>내보내기</span>
              <span className={styles.value}>우리 데이터 전체(JSON·사진 ZIP)</span>
            </div>
            <button className={styles.ghostBtn} type="button" onClick={() => void onExport()} disabled={exporting}>
              {exporting ? '내보내는 중…' : '내 데이터 내보내기'}
            </button>
            {/* 관계종료 회수용(§10.4) — 원본 사진 blob 포함 ZIP, 양측 동등 */}
            <button className={styles.ghostBtn} type="button" onClick={() => void onExportZip()} disabled={exporting}>
              {exporting ? '내보내는 중…' : '사진·데이터 ZIP 내보내기'}
            </button>
            {exportError ? (
              <p className={styles.exportError} role="alert">
                {exportError}
              </p>
            ) : null}
          </section>
        ) : null}

        {/* 휴지통(P4) — 시트에서 우리 탭으로 이동. 삭제는 복구 가능(soft-delete, §4.3). */}
        {couple?.coupleId ? (
          <section className={styles.card} aria-label="휴지통">
            {conflict.conflict ? <ConflictBanner onDismiss={conflict.clear} /> : null}
            <TrashSection
              open={trashOpen}
              onToggle={() => setTrashOpen((v) => !v)}
              items={trash ?? []}
              busy={restorePending}
              onRestore={(t) => restorePlace({ id: t.id, expectedVersion: t.version })}
            />
          </section>
        ) : null}

        {/* 연결 해제 */}
        {couple?.status === 'ACTIVE' ? (
          <section className={styles.card} aria-label="연결 관리">
            <button className={styles.dangerGhost} onClick={() => setConfirming(true)}>
              연결 해제
            </button>
            <Dialog
              open={confirming}
              onClose={() => setConfirming(false)}
              ariaLabel="연결 해제 확인"
              initialFocusRef={cancelRef}
            >
              {/* 정직 카피 + 해제 전 내보내기 필수 게이트(§10.4, security-privacy §5.1) */}
              <DisconnectConfirm
                exporting={exporting}
                exported={exported}
                onExportZip={() => void onExportZip()}
                onDisconnect={onDisconnect}
                onCancel={() => setConfirming(false)}
                disconnectPending={disconnect.isPending}
                cancelRef={cancelRef}
              />
            </Dialog>
          </section>
        ) : null}
      </div>
    </ScreenScaffold>
  )
}
