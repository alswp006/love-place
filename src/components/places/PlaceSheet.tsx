import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { EmptyState } from '@/components/common/EmptyState'
import { ConflictBanner } from '@/components/common/ConflictBanner'
import { Toast } from '@/components/common/Toast'
import { useToast } from '@/hooks/useToast'
import { TripsSection } from '@/components/places/TripsSection'
import { PlaceList } from '@/components/places/PlaceList'
import { TrashSection } from '@/components/places/TrashSection'
import { useMarkVisited, type VisitRow } from '@/hooks/useVisits'
import { useSetWishPriority } from '@/hooks/useSetWishPriority'
import { useTrashPlaces, useDeletePlace, useRestorePlace } from '@/hooks/usePlaceTrash'
import { useConflict } from '@/lib/sync/useConflict'
import type { ProfileMap } from '@/hooks/useProfiles'
import type { WishData } from '@/hooks/useWishes'
import type { PlaceRow } from '@/hooks/usePlaces'
import type { WithWish } from '@/lib/places/wishStatus'
import { nextSnap, prevSnap, snapForOffset, translateYFor, type SnapStop } from '@/lib/places/sheetSnap'
import styles from './PlaceSheet.module.css'

// 통합 화면 하단 드래그 시트 — 검색 + 필터 + PlaceList + Trips + 휴지통. peek/half/full 스냅.
// 데이터는 상위(MapPage)에서 props로 받고, 쓰기 mutation(우선순위/삭제/복구/방문)만 자체 보유.
export function PlaceSheet({
  coupleId,
  myId,
  coupleActive,
  places,
  wishes,
  visits,
  visitedIds,
  profiles,
  placesLoading,
  selectedId,
  onSelect,
}: {
  coupleId: string | null
  myId: string | null
  coupleActive: boolean
  places: WithWish<PlaceRow>[]
  wishes: WishData | undefined
  visits: VisitRow[]
  visitedIds: Set<string>
  profiles: ProfileMap
  placesLoading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const toast = useToast()
  const conflict = useConflict()
  const markVisited = useMarkVisited(coupleId, myId)
  const { setPriority, isPending: priorityPending } = useSetWishPriority(coupleId, myId, conflict.flag)
  const { deletePlace, isPending: deletePending } = useDeletePlace(coupleId, myId, conflict.flag)
  const { restorePlace, isPending: restorePending } = useRestorePlace(coupleId, myId, conflict.flag)
  const [trashOpen, setTrashOpen] = useState(false)
  const { data: trash } = useTrashPlaces(coupleId, trashOpen)
  const [placeFilter, setPlaceFilter] = useState<'all' | 'wish' | 'visited'>('all')

  const visible = useMemo(() => {
    if (placeFilter === 'wish') return places.filter((p) => !visitedIds.has(p.id))
    if (placeFilter === 'visited') return places.filter((p) => visitedIds.has(p.id))
    return places
  }, [places, placeFilter, visitedIds])

  // 스냅 상태 + 드래그 — transform: translateY로 위치. JS 드래그는 애니메이션이 아니라 즉시 반영,
  // 손 뗀 뒤 정착만 CSS transition(reduce-motion이 0으로 만듦, ux §5).
  const [snap, setSnap] = useState<SnapStop>('peek')
  const [dragY, setDragY] = useState<number | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ pointerY: number; baseY: number } | null>(null)
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const restY = translateYFor(snap, vh)
  const translateY = dragY ?? restY

  // 마커 클릭/리스트 탭으로 selectedId가 생기고 시트가 peek면 half로 살짝 올린다(§6 (c)).
  // 이미 half/full이면 사용자가 펼친 상태를 존중(강제로 더 올리거나 내리지 않음).
  useEffect(() => {
    if (selectedId && snap === 'peek') setSnap('half')
  }, [selectedId, snap])

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    sheetRef.current?.style.setProperty('transition', 'none')
    dragStart.current = { pointerY: e.clientY, baseY: restY }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragStart.current) return
    const dy = e.clientY - dragStart.current.pointerY
    const next = Math.max(0, Math.min(vh, dragStart.current.baseY + dy))
    setDragY(next)
  }
  const endDrag = () => {
    sheetRef.current?.style.removeProperty('transition')
    if (dragY != null) setSnap(snapForOffset(dragY, vh))
    setDragY(null)
    dragStart.current = null
  }

  // 탭 대체(제스처 발견성↓ 보완, ux §1): full이면 한 단계 접고, 아니면 한 단계 펼친다.
  const cycleSnap = () => setSnap((s) => (s === 'full' ? prevSnap(s) : nextSnap(s)))
  const handleLabel = snap === 'full' ? '시트 단계 전환(접기)' : '시트 펼치기'

  return (
    <div
      ref={sheetRef}
      className={styles.sheet}
      role="dialog"
      aria-modal="false"
      aria-label="장소 시트"
      style={{ transform: `translateY(${translateY}px)` }}
    >
      {/* peek-pinned 헤더 — peek 비율에서도 항상 보임: 핸들 + 요약 + 필터 칩(§5 peek 콘텐츠). */}
      <div className={styles.peekHeader} data-peek-pinned="true">
        <div className={styles.handleRow}>
          <span className={styles.handle} aria-hidden />
          <button
            type="button"
            className={styles.handleBtn}
            onClick={cycleSnap}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            aria-label={handleLabel}
          >
            <span className={styles.summary}>우리 장소 {places.length}곳</span>
          </button>
        </div>

        {coupleActive ? (
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
        ) : null}
      </div>

      {!coupleActive ? (
        <div className={styles.body}>
          <EmptyState
            emoji="💑"
            title="먼저 상대와 연결해요"
            hint="'우리' 탭에서 초대 코드로 연결하면, 둘이 함께 장소를 모을 수 있어요."
          />
        </div>
      ) : (
        <div className={styles.body}>
          {conflict.conflict ? <ConflictBanner onDismiss={conflict.clear} /> : null}

          <PlaceList
            visible={visible}
            wishes={wishes}
            visitedIds={visitedIds}
            profiles={profiles}
            myId={myId}
            placesLoading={placesLoading}
            placeFilter={placeFilter}
            selectedId={selectedId}
            onSelect={onSelect}
            setPriority={setPriority}
            priorityPending={priorityPending}
            markVisited={markVisited}
            deletePlace={deletePlace}
            deletePending={deletePending}
            onToast={toast.show}
          />

          <TripsSection coupleId={coupleId} myId={myId} visits={visits} />

          <TrashSection
            open={trashOpen}
            onToggle={() => setTrashOpen((v) => !v)}
            items={trash ?? []}
            busy={restorePending}
            onRestore={(t) => restorePlace({ id: t.id, expectedVersion: t.version })}
          />
        </div>
      )}
      <Toast msg={toast.msg} />
    </div>
  )
}
