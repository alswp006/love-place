import { useState, useRef } from 'react'
import { daysTogether, partnerLabel } from '@/lib/partner'
import { getNickname, setNickname } from '@/state/nickname'
import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { Skeleton } from '@/components/common/Skeleton'
import { Dialog } from '@/components/common/Dialog'
import { useAuth } from '@/state/auth'
import { useSignOut } from '@/hooks/useSignOut'
import { useCouple } from '@/hooks/useCouple'
import { useDisconnectCouple } from '@/hooks/useCoupleInvite'
import { fetchCoupleExport, fetchPhotoBlobs, downloadJson, downloadBlob } from '@/lib/export/dumpSchema'
import { buildExportZip } from '@/lib/export/buildZip'
import { dayKey } from '@/lib/calendar/eventDays'
import { tabByPath } from '@/app/tabs'
import { TrashSection } from '@/components/trash/TrashSection'
import { useTrash, useRestore, type TrashRow, type TrashKind } from '@/hooks/useTrash'
import { useConflict } from '@/lib/sync/useConflict'
import { ConflictBanner } from '@/components/common/ConflictBanner'
import { ProfileEditor } from '@/components/profile/ProfileEditor'
import { DisconnectConfirm } from '@/components/profile/DisconnectConfirm'
import { LocationControlCenter } from '@/components/journey/LocationControlCenter'
import { Button } from '@/components/ui/Button'
import styles from './UsPage.module.css'

// 💑 우리 — 프로필·연결·내보내기(§3, §10). 연결 후 상대 표시 + 연결 해제.
export default function UsPage() {
  const tab = tabByPath('/us')
  const { user } = useAuth()
  const signOut = useSignOut()
  const { data: couple, isLoading: coupleLoading } = useCouple()
  const disconnect = useDisconnectCouple()
  const [confirming, setConfirming] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  // JSON 내보냄 표시(카드 affordance용) — 해제 게이트는 zipExported만 사용.
  const [, setExported] = useState(false)
  // 해제 게이트는 ZIP(원본 사진 포함) 전용으로만 충족 — JSON-only 내보내기가 게이트를 우회하지 못하게(§10.4).
  const [zipExported, setZipExported] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const myId = user?.id ?? null
  const conflict = useConflict()
  const [trashOpen, setTrashOpen] = useState(false)
  const coupleId = couple?.coupleId ?? null
  // 통합 휴지통(R3 T17) — 전 엔티티의 soft-delete 행을 한 섹션에서. kind별 조회를 합쳐 삭제일 desc로 정렬.
  const trashPlaces = useTrash('places', coupleId, trashOpen)
  const trashEvents = useTrash('events', coupleId, trashOpen)
  const trashVisits = useTrash('visits', coupleId, trashOpen)
  const trashPhotos = useTrash('photos', coupleId, trashOpen)
  const trashTrips = useTrash('trips', coupleId, trashOpen)
  const trashItineraries = useTrash('itineraries', coupleId, trashOpen)
  const trashItems: TrashRow[] = [
    ...(trashPlaces.data ?? []),
    ...(trashEvents.data ?? []),
    ...(trashVisits.data ?? []),
    ...(trashPhotos.data ?? []),
    ...(trashTrips.data ?? []),
    ...(trashItineraries.data ?? []),
  ].sort((a, b) => b.deleted_at.localeCompare(a.deleted_at))

  // kind별 복구 훅 — row.kind로 디스패치(낙관적 락 + 오프라인 큐는 useRestore 내부).
  const restorers: Record<TrashKind, ReturnType<typeof useRestore>> = {
    places: useRestore('places', coupleId, myId, conflict.flag),
    events: useRestore('events', coupleId, myId, conflict.flag),
    visits: useRestore('visits', coupleId, myId, conflict.flag),
    photos: useRestore('photos', coupleId, myId, conflict.flag),
    trips: useRestore('trips', coupleId, myId, conflict.flag),
    itineraries: useRestore('itineraries', coupleId, myId, conflict.flag),
  }
  const restorePending = Object.values(restorers).some((r) => r.isPending)
  const onRestoreTrash = (row: TrashRow) =>
    restorers[row.kind].restore({ id: row.id, expectedVersion: row.version })

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
      setZipExported(true)
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

  // 콜드스타트 플래시 제거(Task 9): 커플 정보 로딩 중엔 프로필/연결 블록 대신 페이지 스켈레톤.
  if (coupleLoading) {
    return (
      <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
        <Skeleton count={4} label="우리 정보 불러오는 중" />
      </ScreenScaffold>
    )
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
                <Button
                  variant="ghost"
                  type="button"
                  onClick={onSaveNick}
                  disabled={!nickDraft.trim()}
                >
                  저장
                </Button>
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
          <Button variant="ghost" type="button" onClick={() => void signOut()}>
            로그아웃
          </Button>
        </section>

        {/* 내보내기(§10.4 회수권) — 둘 다 동등하게 내 커플 데이터 전체를 가져갈 수 있다 */}
        {couple?.coupleId ? (
          <section className={styles.card} aria-label="데이터 내보내기">
            <div className={styles.row}>
              <span className={styles.label}>내보내기</span>
              <span className={styles.value}>우리 데이터 전체(JSON·사진 ZIP)</span>
            </div>
            <Button variant="ghost" type="button" onClick={() => void onExport()} disabled={exporting}>
              {exporting ? '내보내는 중…' : '내 데이터 내보내기'}
            </Button>
            {/* 관계종료 회수용(§10.4) — 원본 사진 blob 포함 ZIP, 양측 동등 */}
            <Button variant="ghost" type="button" onClick={() => void onExportZip()} disabled={exporting}>
              {exporting ? '내보내는 중…' : '사진·데이터 ZIP 내보내기'}
            </Button>
            {exportError ? (
              <p className={styles.exportError} role="alert">
                {exportError}
              </p>
            ) : null}
          </section>
        ) : null}

        {/* 위치 동선 기록(R6) — 동의 관리 + 즉시 중단(위치정보법 제24조2 항상 가능 컨트롤). */}
        {couple?.coupleId ? (
          <section className={styles.card} aria-label="위치 동선 컨트롤">
            <LocationControlCenter coupleId={couple.coupleId} userId={myId} />
          </section>
        ) : null}

        {/* 휴지통(P4) — 시트에서 우리 탭으로 이동. 삭제는 복구 가능(soft-delete, §4.3). */}
        {couple?.coupleId ? (
          <section className={styles.card} aria-label="휴지통">
            {conflict.conflict ? <ConflictBanner onDismiss={conflict.clear} /> : null}
            <TrashSection
              open={trashOpen}
              onToggle={() => setTrashOpen((v) => !v)}
              items={trashItems}
              busy={restorePending}
              onRestore={onRestoreTrash}
            />
          </section>
        ) : null}

        {/* 연결 해제 */}
        {couple?.status === 'ACTIVE' ? (
          <section className={styles.card} aria-label="연결 관리">
            <Button variant="danger" type="button" onClick={() => setConfirming(true)}>
              연결 해제
            </Button>
            <Dialog
              open={confirming}
              onClose={() => setConfirming(false)}
              ariaLabel="연결 해제 확인"
              initialFocusRef={cancelRef}
            >
              {/* 정직 카피 + 해제 전 내보내기 필수 게이트(§10.4, security-privacy §5.1) */}
              <DisconnectConfirm
                exporting={exporting}
                exported={zipExported}
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
