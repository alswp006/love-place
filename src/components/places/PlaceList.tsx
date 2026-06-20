import { useEffect, useRef } from 'react'
import { EmptyState } from '@/components/common/EmptyState'
import { Skeleton } from '@/components/common/Skeleton'
import { Heart } from '@/components/nav/icons'
import type { WishData } from '@/hooks/useWishes'
import type { PlaceRow } from '@/hooks/usePlaces'
import type { UseMutationResult } from '@tanstack/react-query'
import { cyclePriority, MAX_PRIORITY, type WishStatus, type WithWish } from '@/lib/places/wishStatus'
import { haptic } from '@/lib/haptics'
import styles from './PlaceList.module.css'

type MarkVisited = UseMutationResult<void, Error, { placeId: string; visitDate?: string; alreadyVisited?: boolean }>

// 장소 카드 리스트(PlacesPage에서 추출). 카드 본문 탭 → onSelect(placeId)로 지도/말풍선 동기화.
export function PlaceList({
  visible,
  wishes,
  visitedIds,
  placesLoading,
  placeFilter,
  selectedId,
  onSelect,
  setPriority,
  priorityPending,
  markVisited,
  onUnvisit,
  unvisitPending,
  deletePlace,
  deletePending,
  onToast,
  onToastAction,
  restorePlace,
}: {
  visible: WithWish<PlaceRow>[]
  wishes: WishData | undefined
  visitedIds: Set<string>
  placesLoading: boolean
  placeFilter: 'all' | 'wish' | 'visited'
  selectedId: string | null
  onSelect: (id: string) => void
  setPriority: (v: { wishId: string; expectedVersion: number; priority: number }) => void
  priorityPending: boolean
  markVisited: MarkVisited
  onUnvisit: (placeId: string) => void
  unvisitPending: boolean
  deletePlace: (
    v: { id: string; expectedVersion: number },
    opts?: { onSuccess?: () => void },
  ) => void
  deletePending: boolean
  onToast: (m: string) => void
  onToastAction: (arg: { message: string; action: { label: string; onClick: () => void } }) => void
  restorePlace: (v: { id: string; expectedVersion: number }) => void
}) {
  const listRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    if (!selectedId || !listRef.current) return
    const node = listRef.current.querySelector<HTMLElement>(`[data-place-id="${selectedId}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])
  return (
    <section className={styles.listSection} aria-label="장소 목록">
      {placesLoading ? (
        <Skeleton count={4} label="가고싶은 장소 불러오는 중" />
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
        <ul className={styles.list} ref={listRef}>
          {visible.map((p) => {
            const myWish = wishes?.mine[p.id]
            const visited = visitedIds.has(p.id)
            const isSelected = p.id === selectedId
            return (
              <li
                key={p.id}
                data-place-id={p.id}
                className={`${styles.card} ${isSelected ? styles.cardSelected : ''}`}
              >
                <button
                  type="button"
                  className={styles.cardMain}
                  onClick={() => onSelect(p.id)}
                  aria-pressed={isSelected}
                  aria-label={`${p.name} 지도에서 보기`}
                >
                  <span className={styles.cardName}>{p.name}</span>
                  {p.address ? <span className={styles.cardAddr}>{p.address}</span> : null}
                  <span className={styles.wishLine}>
                    <WishBadge wish={p.wish} />
                  </span>
                </button>
                <div className={styles.cardSide}>
                  {myWish ? (
                    <PriorityStepper
                      priority={myWish.priority}
                      disabled={priorityPending}
                      onCycle={() => {
                        setPriority({
                          wishId: myWish.wishId,
                          expectedVersion: myWish.version,
                          priority: cyclePriority(myWish.priority),
                        })
                        haptic() // 낙관적 시점 — 시각(하트 채움) 피드백 병행(ux §1).
                      }}
                    />
                  ) : null}
                  {visited ? (
                    // 방문 토글(spec §3.3): 다시 누르면 가봤음 취소(soft-delete). 색+텍스트 이중화(§8).
                    <button
                      type="button"
                      className={styles.visitedBadge}
                      onClick={() => onUnvisit(p.id)}
                      disabled={unvisitPending}
                      aria-label={`${p.name} 가봤음 기록 취소`}
                    >
                      ✅ 가봤음 (취소)
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.visitBtn}
                      onClick={() =>
                        markVisited.mutate(
                          { placeId: p.id, alreadyVisited: visitedIds.has(p.id) },
                          { onSuccess: () => onToast('가봤어요로 기록했어요 ✅') },
                        )
                      }
                      disabled={markVisited.isPending}
                      aria-label={`${p.name} 다녀왔어요`}
                    >
                      다녀왔어요
                    </button>
                  )}
                  {/* 편차: 장소 카드 출처 아바타 제거(ux §2 "모든 공유 항목 출처" 예외 — 사용자 결정, spec §3.2). */}
                  {p.region_label ? <span className={styles.badge}>{p.region_label}</span> : null}
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={() =>
                      deletePlace(
                        { id: p.id, expectedVersion: p.version },
                        {
                          onSuccess: () =>
                            onToastAction({
                              message: '휴지통으로 옮겼어요',
                              action: {
                                label: '실행취소',
                                onClick: () => restorePlace({ id: p.id, expectedVersion: p.version + 1 }),
                              },
                            }),
                        },
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
