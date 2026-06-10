import { useMemo, useState } from 'react'
import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { EmptyState } from '@/components/common/EmptyState'
import { ConflictBanner } from '@/components/common/ConflictBanner'
import { SourceAvatar } from '@/components/common/SourceAvatar'
import { Toast } from '@/components/common/Toast'
import { useToast } from '@/hooks/useToast'
import { PlaceSearch } from '@/components/places/PlaceSearch'
import { Heart } from '@/components/nav/icons'
import { useAuth } from '@/state/auth'
import { useCouple } from '@/hooks/useCouple'
import { usePlaces } from '@/hooks/usePlaces'
import { useProfiles } from '@/hooks/useProfiles'
import { useWishes } from '@/hooks/useWishes'
import { useVisits, useMarkVisited } from '@/hooks/useVisits'
import { useSetWishPriority } from '@/hooks/useSetWishPriority'
import { useTrashPlaces, useDeletePlace, useRestorePlace, type TrashPlaceRow } from '@/hooks/usePlaceTrash'
import { useRealtimePlaces } from '@/hooks/useRealtimePlaces'
import { useConflict } from '@/lib/sync/useConflict'
import { attachAndSortWishes, cyclePriority, MAX_PRIORITY, type WishStatus } from '@/lib/places/wishStatus'
import { tabByPath } from '@/app/tabs'
import styles from './PlacesPage.module.css'

// 📍 장소 — 네이버 지역검색 저장 + 위시 목록(§5.2). 둘 다 찜 우선 정렬·하트 우선순위(3·4단계)·휴지통 복구(D3).
export default function PlacesPage() {
  const tab = tabByPath('/places')
  const { user } = useAuth()
  const myId = user?.id ?? null
  const { data: couple, isLoading: coupleLoading } = useCouple()
  const coupleId = couple?.coupleId ?? null
  const { data: places, isLoading: placesLoading } = usePlaces(coupleId)
  const { data: profiles } = useProfiles(coupleId)
  const { data: wishes } = useWishes(coupleId, myId)
  const { data: visits } = useVisits(coupleId)
  const markVisited = useMarkVisited(coupleId, myId)
  const toast = useToast()
  const conflict = useConflict()
  const { setPriority, isPending: priorityPending } = useSetWishPriority(coupleId, myId, conflict.flag)
  const { deletePlace, isPending: deletePending } = useDeletePlace(coupleId, myId, conflict.flag)
  const { restorePlace, isPending: restorePending } = useRestorePlace(coupleId, myId, conflict.flag)
  const [trashOpen, setTrashOpen] = useState(false)
  const [placeFilter, setPlaceFilter] = useState<'all' | 'wish' | 'visited'>('all')
  const { data: trash } = useTrashPlaces(coupleId, trashOpen)
  useRealtimePlaces(coupleId) // 상대가 추가하면 즉시 반영

  // 둘 다 찜 → 찜 인원 → 우선순위 순 정렬. 훅은 조기 반환보다 위에서.
  const sorted = useMemo(
    () => attachAndSortWishes(places ?? [], wishes?.byPlace ?? {}, myId),
    [places, wishes, myId],
  )
  const visitedIds = useMemo(() => new Set((visits ?? []).map((v) => v.place_id)), [visits])
  // 가고싶은(아직 안 감) / 가본 / 전체 필터(§4.2). "가봤음 = visits 존재" 도출.
  const visible = useMemo(() => {
    if (placeFilter === 'wish') return sorted.filter((p) => !visitedIds.has(p.id))
    if (placeFilter === 'visited') return sorted.filter((p) => visitedIds.has(p.id))
    return sorted
  }, [sorted, placeFilter, visitedIds])

  // 아직 커플 연결 전이면 검색/저장이 무의미 → 연결 안내(§4.2).
  if (!coupleLoading && couple?.status !== 'ACTIVE') {
    return (
      <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
        <EmptyState
          emoji="💑"
          title="먼저 상대와 연결해요"
          hint="'우리' 탭에서 초대 코드로 연결하면, 둘이 함께 장소를 모을 수 있어요."
        />
      </ScreenScaffold>
    )
  }

  return (
    <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
      <div className={styles.container}>
        <PlaceSearch coupleId={coupleId} />
        {conflict.conflict ? <ConflictBanner onDismiss={conflict.clear} /> : null}
        <Toast msg={toast.msg} />

        <div className={styles.filterRow} role="group" aria-label="장소 필터">
          {(
            [
              ['all', '전체'],
              ['wish', '가고싶은'],
              ['visited', '가본'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`${styles.filterChip} ${placeFilter === key ? styles.filterOn : ''}`}
              aria-pressed={placeFilter === key}
              onClick={() => setPlaceFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <section className={styles.listSection} aria-label="장소 목록">
          {placesLoading ? (
            <p className={styles.loading}>불러오는 중…</p>
          ) : visible.length === 0 ? (
            <EmptyState
              emoji="📍"
              title={placeFilter === 'visited' ? '아직 가본 곳이 없어요' : '첫 가고싶은 장소를 추가해보세요'}
              hint={
                placeFilter === 'visited'
                  ? '장소 카드의 "다녀왔어요"를 누르면 가본 곳으로 기록돼요.'
                  : '위 검색창에 장소 이름을 입력하면 후보가 떠요.'
              }
            />
          ) : (
            <ul className={styles.list}>
              {visible.map((p) => {
                const myWish = wishes?.mine[p.id]
                const visited = visitedIds.has(p.id)
                return (
                  <li key={p.id} className={styles.card}>
                    <div className={styles.cardMain}>
                      <span className={styles.cardName}>{p.name}</span>
                      {p.address ? <span className={styles.cardAddr}>{p.address}</span> : null}
                      <div className={styles.wishLine}>
                        <WishBadge wish={p.wish} />
                        {myWish ? (
                          <PriorityStepper
                            priority={myWish.priority}
                            disabled={priorityPending}
                            onCycle={() =>
                              setPriority({
                                wishId: myWish.wishId,
                                expectedVersion: myWish.version,
                                priority: cyclePriority(myWish.priority),
                              })
                            }
                          />
                        ) : null}
                        {visited ? (
                          <span className={styles.visitedBadge}>✅ 가봤어요</span>
                        ) : (
                          <button
                            type="button"
                            className={styles.visitBtn}
                            onClick={() =>
                              markVisited.mutate(
                                { placeId: p.id },
                                { onSuccess: () => toast.show('가봤어요로 기록했어요 ✅') },
                              )
                            }
                            disabled={markVisited.isPending}
                          >
                            다녀왔어요
                          </button>
                        )}
                      </div>
                    </div>
                    <div className={styles.cardSide}>
                      <SourceAvatar userId={p.added_by} profiles={profiles ?? {}} myId={myId} context=" 추가" />
                      {p.region_label ? <span className={styles.badge}>{p.region_label}</span> : null}
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        onClick={() =>
                          deletePlace(
                            { id: p.id, expectedVersion: p.version },
                            { onSuccess: () => toast.show('휴지통으로 옮겼어요 — 아래 휴지통에서 복구할 수 있어요') },
                          )
                        }
                        disabled={deletePending}
                        aria-label={`${p.name} 휴지통으로 보내기`}
                      >
                        🗑
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <TrashSection
          open={trashOpen}
          onToggle={() => setTrashOpen((v) => !v)}
          items={trash ?? []}
          busy={restorePending}
          onRestore={(t) => restorePlace({ id: t.id, expectedVersion: t.version })}
        />
      </div>
    </ScreenScaffold>
  )
}

// 찜 상태 — 색 + 텍스트 라벨 이중화(§8 색각 이상 대응).
function WishBadge({ wish }: { wish: WishStatus }) {
  if (wish.wishCount === 0) return null
  const label = wish.bothWished ? '둘 다 찜' : wish.wishedByMe ? '나만 찜' : '상대만 찜'
  const cls = wish.bothWished ? styles.wishBoth : wish.wishedByMe ? styles.wishMine : styles.wishPartner
  return (
    <span className={`${styles.wishBadge} ${cls}`}>
      {wish.bothWished ? '💑 ' : ''}
      {label}
    </span>
  )
}

// 내 우선순위 하트 — 탭하면 0→1→2→3→0 순환(낙관적 락 저장). 하트≠리액션(ux §2).
function PriorityStepper({
  priority,
  disabled,
  onCycle,
}: {
  priority: number
  disabled: boolean
  onCycle: () => void
}) {
  return (
    <button
      type="button"
      className={styles.heartBtn}
      onClick={onCycle}
      disabled={disabled}
      aria-label={`내 우선순위 ${priority}단계 (눌러서 변경)`}
    >
      {Array.from({ length: MAX_PRIORITY }, (_, i) => (
        <Heart key={i} filled={i < priority} className={styles.heart} />
      ))}
    </button>
  )
}

// 휴지통(D3) — 삭제는 복구 가능(물리삭제 아님). "상대가 지운 우리 추억"도 둘 다 복구.
function TrashSection({
  open,
  onToggle,
  items,
  busy,
  onRestore,
}: {
  open: boolean
  onToggle: () => void
  items: TrashPlaceRow[]
  busy: boolean
  onRestore: (t: TrashPlaceRow) => void
}) {
  return (
    <section className={styles.trash} aria-label="휴지통">
      <button type="button" className={styles.trashToggle} onClick={onToggle} aria-expanded={open}>
        <span>🗑 휴지통{open && items.length > 0 ? ` (${items.length})` : ''}</span>
        <span aria-hidden>{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        items.length === 0 ? (
          <p className={styles.trashEmpty}>삭제한 장소가 없어요.</p>
        ) : (
          <ul className={styles.trashList}>
            {items.map((t) => (
              <li key={t.id} className={styles.trashItem}>
                <span className={styles.trashName}>{t.name}</span>
                <button
                  type="button"
                  className={styles.restoreBtn}
                  onClick={() => onRestore(t)}
                  disabled={busy}
                >
                  복구
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  )
}
