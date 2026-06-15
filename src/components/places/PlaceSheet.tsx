import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { EmptyState } from '@/components/common/EmptyState'
import { ConflictBanner } from '@/components/common/ConflictBanner'
import { Toast } from '@/components/common/Toast'
import { useToast } from '@/hooks/useToast'
import { PlaceList } from '@/components/places/PlaceList'
import { PlaceDetail } from '@/components/places/PlaceDetail'
import { PlacePreviewDetail } from '@/components/places/PlacePreviewDetail'
import { useToggleReaction, type ReactionMap } from '@/hooks/useReactions'
import type { KakaoPlaceHit } from '@/lib/kakao/types'
import { useMarkVisited, useUnmarkVisited, type VisitRow } from '@/hooks/useVisits'
import { useSetWishPriority } from '@/hooks/useSetWishPriority'
import { useDeletePlace } from '@/hooks/usePlaceTrash'
import { useConflict } from '@/lib/sync/useConflict'
import type { WishData } from '@/hooks/useWishes'
import type { PlaceRow } from '@/hooks/usePlaces'
import type { WithWish } from '@/lib/places/wishStatus'
import { nextSnap, prevSnap, snapForOffset, translateYFor, type SnapStop } from '@/lib/places/sheetSnap'
import { sheetTravelHeight, setAppVh } from '@/lib/layout/appViewport'
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
  placesLoading,
  selectedId,
  onSelect,
  previewHit,
  reactions,
  onSave,
  onCloseDetail,
  snap,
  onSnapChange,
}: {
  coupleId: string | null
  myId: string | null
  coupleActive: boolean
  places: WithWish<PlaceRow>[]
  wishes: WishData | undefined
  visits: VisitRow[]
  visitedIds: Set<string>
  placesLoading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  previewHit: KakaoPlaceHit | null
  reactions: ReactionMap | undefined
  onSave: () => void
  onCloseDetail: () => void
  snap: SnapStop
  onSnapChange: (s: SnapStop) => void
}) {
  const toast = useToast()
  const conflict = useConflict()
  const markVisited = useMarkVisited(coupleId, myId)
  const unmarkVisited = useUnmarkVisited(coupleId, myId, conflict.flag)
  const { setPriority, isPending: priorityPending } = useSetWishPriority(coupleId, myId, conflict.flag)
  const { deletePlace, isPending: deletePending } = useDeletePlace(coupleId, myId, conflict.flag)
  // 시트 소유 리액션 토글(말풍선 폐지 준비). useToggleReaction은 (coupleId, myId) 2-인자 — 플랜의
  // conflict.flag 세 번째 인자는 현 시그니처에 없어 컴파일 불가라 생략(adapt).
  const toggleReaction = useToggleReaction(coupleId, myId)
  const selectedPlace = selectedId ? places.find((p) => p.id === selectedId) ?? null : null
  const [placeFilter, setPlaceFilter] = useState<'all' | 'wish' | 'visited'>('all')

  const visible = useMemo(() => {
    if (placeFilter === 'wish') return places.filter((p) => !visitedIds.has(p.id))
    if (placeFilter === 'visited') return places.filter((p) => visitedIds.has(p.id))
    return places
  }, [places, placeFilter, visitedIds])

  // 스냅 상태 + 드래그 — transform: translateY로 위치. JS 드래그는 애니메이션이 아니라 즉시 반영,
  // 손 뗀 뒤 정착만 CSS transition(reduce-motion이 0으로 만듦, ux §5).
  // snap은 MapPage가 정본(NaverMap의 플로팅 버튼/토스트도 같은 값을 읽음) — setSnap은 그 setter 별칭.
  const setSnap = onSnapChange
  const [dragY, setDragY] = useState<number | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ pointerY: number; baseY: number } | null>(null)
  // 뷰포트 높이는 상태로 추적 — iOS Safari 주소창 show/hide·회전 시 window.innerHeight가 바뀌므로
  // 리스너로 갱신해야 시트 위치(translateY)가 어긋나지 않는다(모바일 Safari 1차 대상).
  const [vh, setVh] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 800))
  // 시트는 탭바 위에 앵커 — translate 계산에서 탭바·safe-area를 제외한다(탭바 가림 방지).
  const TABBAR_H = 72 // = --tabbar-h(tokens.css). 시트는 탭바 위에 앵커.
  const peekRef = useRef<HTMLDivElement>(null)
  const [peekPx, setPeekPx] = useState(128)
  const [safeBottom, setSafeBottom] = useState(0)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const measure = () => {
      setVh(window.innerHeight)
      setAppVh(window.innerHeight) // CSS(.sheet height/bottom)와 JS(translate)가 같은 vh를 읽게.
      if (peekRef.current) setPeekPx(peekRef.current.getBoundingClientRect().height)
      const sb = getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')
      const px = parseFloat(sb) || 0
      setSafeBottom(px)
    }
    measure()
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure) // iOS 주소창 변화
    return () => {
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [])
  const travel = sheetTravelHeight(vh, TABBAR_H, safeBottom)
  const restY = translateYFor(snap, travel, peekPx)
  const translateY = dragY ?? restY

  // 마커 클릭/리스트 탭으로 selectedId가 생기고 시트가 peek면 half로 살짝 올린다(§6 (c)).
  // 이미 half/full이면 사용자가 펼친 상태를 존중(강제로 더 올리거나 내리지 않음).
  useEffect(() => {
    if (selectedId && snap === 'peek') setSnap('half')
  }, [selectedId, snap])

  // 빈/미연결/로딩이면 첫 화면이 죽지 않게 half로 자동 오픈(spec §3.3). peek에서만(사용자 펼침 존중).
  const autoHalfRef = useRef(false)
  useEffect(() => {
    if (autoHalfRef.current) return
    const nothingToShow = !coupleActive || placesLoading || places.length === 0
    if (nothingToShow && snap === 'peek') {
      autoHalfRef.current = true
      setSnap('half')
    }
  }, [coupleActive, placesLoading, places.length, snap])

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    sheetRef.current?.style.setProperty('transition', 'none')
    dragStart.current = { pointerY: e.clientY, baseY: restY }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragStart.current) return
    const dy = e.clientY - dragStart.current.pointerY
    // travel(탭바 제외)로 클램프 — 시트가 탭바 뒤로 내려가지 못하게.
    const next = Math.max(0, Math.min(travel, dragStart.current.baseY + dy))
    setDragY(next)
  }
  const endDrag = () => {
    sheetRef.current?.style.removeProperty('transition')
    if (dragY != null) setSnap(snapForOffset(dragY, travel, peekPx))
    setDragY(null)
    dragStart.current = null
  }

  // 탭 대체(제스처 발견성↓ 보완, ux §1): full이면 한 단계 접고, 아니면 한 단계 펼친다.
  // snap은 controlled(prop) — 함수형 updater 대신 현재 값으로 다음 스냅을 계산해 onSnapChange로 올린다.
  const cycleSnap = () => setSnap(snap === 'full' ? prevSnap(snap) : nextSnap(snap))
  const handleLabel = snap === 'full' ? '시트 단계 전환(접기)' : '시트 펼치기'

  return (
    <>
      {/* full/half 확장 시 지도 위 백드롭 — 탭하면 peek로 collapse(z 44, 시트 45 아래·탭바 46 아래). */}
      {snap !== 'peek' ? (
        <button
          type="button"
          className={styles.backdrop}
          aria-label="시트 접기"
          onClick={() => setSnap('peek')}
        />
      ) : null}
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="region"
        aria-label="장소 시트"
        style={{ transform: `translateY(${translateY}px)` }}
      >
      {/* peek-pinned 헤더 — peek 비율에서도 항상 보임: 핸들 + 요약 + 필터 칩(§5 peek 콘텐츠). */}
      <div ref={peekRef} className={styles.peekHeader} data-peek-pinned="true">
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
            aria-expanded={snap !== 'peek'}
            aria-label={handleLabel}
          >
            <span className={styles.summary}>
              {placesLoading ? '불러오는 중…' : `우리 장소 ${places.length}곳`}
            </span>
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
          {previewHit ? (
            <PlacePreviewDetail
              hit={previewHit}
              saving={false}
              onSave={onSave}
              onClose={onCloseDetail}
            />
          ) : selectedPlace ? (
            <PlaceDetail
              place={selectedPlace}
              visited={visitedIds.has(selectedPlace.id)}
              didIReact={reactions?.[selectedPlace.id]?.didIReact ?? false}
              reactionCount={reactions?.[selectedPlace.id]?.count ?? 0}
              busy={markVisited.isPending || unmarkVisited.isPending}
              onVisit={() => {
                if (!visitedIds.has(selectedPlace.id))
                  markVisited.mutate({ placeId: selectedPlace.id }, { onSuccess: () => toast.show('가봤어요로 기록했어요 ✅') })
              }}
              onUnvisit={() =>
                unmarkVisited.mutate(
                  { placeId: selectedPlace.id, visits },
                  { onSuccess: () => toast.show('가봤음 기록을 취소했어요') },
                )
              }
              onReact={() => toggleReaction.mutate({ placeId: selectedPlace.id })}
              onClose={onCloseDetail}
            />
          ) : null}

          {conflict.conflict ? <ConflictBanner onDismiss={conflict.clear} /> : null}

          <PlaceList
            visible={visible}
            wishes={wishes}
            visitedIds={visitedIds}
            placesLoading={placesLoading}
            placeFilter={placeFilter}
            selectedId={selectedId}
            onSelect={onSelect}
            setPriority={setPriority}
            priorityPending={priorityPending}
            markVisited={markVisited}
            onUnvisit={(placeId) =>
              unmarkVisited.mutate(
                { placeId, visits },
                { onSuccess: () => toast.show('가봤음 기록을 취소했어요') },
              )
            }
            unvisitPending={unmarkVisited.isPending}
            deletePlace={deletePlace}
            deletePending={deletePending}
            onToast={toast.show}
          />

          {/* 여행 섹션은 코드 보존하되 시트에서 숨김(spec §3.4). 휴지통은 '우리' 탭으로 이동(Task 12). */}
        </div>
      )}
      <Toast msg={toast.msg} />
      </div>
    </>
  )
}
