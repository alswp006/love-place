import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/common/EmptyState'
import { ConflictBanner } from '@/components/common/ConflictBanner'
import { useToast } from '@/components/common/ToastProvider'
import { PlaceList } from '@/components/places/PlaceList'
import { PlaceDetail } from '@/components/places/PlaceDetail'
import { PlacePreviewDetail } from '@/components/places/PlacePreviewDetail'
import { useToggleReaction, type ReactionMap } from '@/hooks/useReactions'
import type { KakaoPlaceHit } from '@/lib/kakao/types'
import { useMarkVisited, useUnmarkVisited } from '@/hooks/useVisits'
import { useSetWishPriority } from '@/hooks/useSetWishPriority'
import { useDeletePlace, useRestorePlace } from '@/hooks/usePlaceTrash'
import { useConflict } from '@/lib/sync/useConflict'
import type { WishData } from '@/hooks/useWishes'
import type { PlaceRow } from '@/hooks/usePlaces'
import type { WithWish } from '@/lib/places/wishStatus'
import { nextSnap, prevSnap, snapForFlick, translateYFor, dimProgress, type SnapStop } from '@/lib/places/sheetSnap'

// full 미만에서 body는 스크롤러가 아니라 시트 드래그 표면 — 리스트 스크롤은 full에서만.
// (half에서 리스트가 스크롤되면 시트가 translateY만큼 내려가 있어 하단이 화면 밖 + 위로 끌어도 시트가 안 펼쳐진다.)
function bodyStyleFor(snap: SnapStop): { overflowY?: 'hidden'; touchAction?: 'none' } {
  return snap === 'full' ? {} : { overflowY: 'hidden', touchAction: 'none' }
}
import { sheetTravelHeight, setAppVh } from '@/lib/layout/appViewport'
import { readPxVar } from '@/lib/layout/cssOffsets'
import { haptic } from '@/lib/haptics'
import {
  useCreateCollection,
  useRenameCollection,
  useDeleteCollection,
  useAddPlaceToCollection,
  useRemovePlaceFromCollection,
  type CollectionRow,
  type PlaceCollectionRow,
} from '@/hooks/useCollections'
import { memberPlaceIdSet, memberCollectionIdSet } from '@/lib/places/collectionFilter'
import { CollectionManager } from './CollectionManager'
import styles from './PlaceSheet.module.css'

// 통합 화면 하단 드래그 시트 — 검색 + 필터 + PlaceList + Trips + 휴지통. peek/half/full 스냅.
// 데이터는 상위(MapPage)에서 props로 받고, 쓰기 mutation(우선순위/삭제/복구/방문)만 자체 보유.
export function PlaceSheet({
  coupleId,
  myId,
  coupleActive,
  places,
  wishes,
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
  collections = [],
  placeCollections = [],
}: {
  coupleId: string | null
  myId: string | null
  coupleActive: boolean
  places: WithWish<PlaceRow>[]
  wishes: WishData | undefined
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
  collections?: CollectionRow[]
  placeCollections?: PlaceCollectionRow[]
}) {
  const toast = useToast()
  const conflict = useConflict()
  const markVisited = useMarkVisited(coupleId, myId)
  const unmarkVisited = useUnmarkVisited(coupleId, myId, conflict.flag)
  const { setPriority, isPending: priorityPending } = useSetWishPriority(coupleId, myId, conflict.flag)
  const { deletePlace, isPending: deletePending } = useDeletePlace(coupleId, myId, conflict.flag)
  const { restorePlace } = useRestorePlace(coupleId, myId, conflict.flag)
  // 시트 소유 리액션 토글(말풍선 폐지). 끄기는 version 조건부 softDelete — 충돌 시 conflict.flag로 배너.
  const toggleReaction = useToggleReaction(coupleId, myId, conflict.flag)
  // 컬렉션(저장 목록) 쓰기 — 데이터(collections/placeCollections)는 상위(MapPage)에서 props로,
  // 쓰기 mutation만 시트가 보유(다른 mutation과 동일 패턴). 변경계는 conflict.flag로 충돌 배너.
  const createCollection = useCreateCollection(coupleId, myId)
  const renameCollection = useRenameCollection(coupleId, myId, conflict.flag)
  const deleteCollection = useDeleteCollection(coupleId, myId, conflict.flag)
  const addToCollection = useAddPlaceToCollection(coupleId, myId)
  const removeFromCollection = useRemovePlaceFromCollection(coupleId, myId, conflict.flag)
  const selectedPlace = selectedId ? places.find((p) => p.id === selectedId) ?? null : null
  const [placeFilter, setPlaceFilter] = useState<'all' | 'wish' | 'visited'>('all')
  // 활성 컬렉션 필터(내장 칩과 별개) + 목록 관리 모달. 삭제된 컬렉션을 가리키면 'all'로 폴백.
  const [activeCollId, setActiveCollId] = useState<string | null>(null)
  const [managerOpen, setManagerOpen] = useState(false)
  const effectiveCollId =
    activeCollId && collections.some((c) => c.id === activeCollId) ? activeCollId : null
  // 상세 모드(마커/카드 탭) — 상세를 주요로 두고 목록·필터 칩을 숨긴다(R1.6, T18). 닫으면 목록 복귀.
  const detailMode = Boolean(selectedPlace || previewHit)

  const collMembers = useMemo(
    () => (effectiveCollId ? memberPlaceIdSet(placeCollections, effectiveCollId) : null),
    [effectiveCollId, placeCollections],
  )
  const visible = useMemo(() => {
    if (collMembers) return places.filter((p) => collMembers.has(p.id))
    if (placeFilter === 'wish') return places.filter((p) => !visitedIds.has(p.id))
    if (placeFilter === 'visited') return places.filter((p) => visitedIds.has(p.id))
    return places
  }, [places, placeFilter, visitedIds, collMembers])

  // 스냅 상태 + 드래그 — transform: translateY로 위치. JS 드래그는 애니메이션이 아니라 즉시 반영,
  // 손 뗀 뒤 정착만 CSS transition(reduce-motion이 0으로 만듦, ux §5).
  // snap은 MapPage가 정본(NaverMap의 플로팅 버튼/토스트도 같은 값을 읽음) — setSnap은 그 setter 별칭.
  const setSnap = onSnapChange
  const [dragY, setDragY] = useState<number | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  // 백드롭도 드래그 중엔 transition을 끈다(딤이 손가락 1:1 추종, 정착 시 복원). 시트 ref와 동일 수명.
  const backdropRef = useRef<HTMLButtonElement>(null)
  const DRAG_THRESHOLD = 6 // px — 탭 vs 드래그
  const dragInfo = useRef<{
    pointerY: number
    baseY: number
    lastY: number
    lastT: number
    velocity: number
    moved: boolean
  } | null>(null)
  // 드래그 직후 발생하는 synthetic click(handleBtn onClick)이 cycleSnap을 또 호출해 한 단계 더
  // 튀는 것을 막는 가드. pointerup이 click보다 먼저 오므로 여기서 true로 세팅하고, 다음 tick에 해제한다.
  const justDraggedRef = useRef(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const bodyDrag = useRef<{ y: number } | null>(null)
  // 뷰포트 높이는 상태로 추적 — iOS Safari 주소창 show/hide·회전 시 window.innerHeight가 바뀌므로
  // 리스너로 갱신해야 시트 위치(translateY)가 어긋나지 않는다(모바일 Safari 1차 대상).
  const [vh, setVh] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 800))
  // 시트는 탭바 위에 앵커 — translate 계산에서 탭바·safe-area를 제외한다(탭바 가림 방지).
  const tabbarH = readPxVar('--tabbar-h', 72) // 토큰 --tabbar-h(tokens.css) 단일출처. 시트는 탭바 위에 앵커.
  const peekRef = useRef<HTMLDivElement>(null)
  // 토큰 --sheet-peek-h(=112+safe)를 읽되 fallback은 기존 리터럴 128로 무회귀 보존. 런타임 peekRef 실측이 즉시 덮어씀.
  const [peekPx, setPeekPx] = useState(() => readPxVar('--sheet-peek-h', 128))
  const [safeBottom, setSafeBottom] = useState(0)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const measure = () => {
      setVh(window.innerHeight)
      setAppVh(window.innerHeight) // CSS(.sheet height/bottom)와 JS(translate)가 같은 vh를 읽게.
      const sb = getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')
      const px = parseFloat(sb) || 0
      setSafeBottom(px)
      if (peekRef.current) {
        const h = peekRef.current.getBoundingClientRect().height
        setPeekPx(h)
        // 지도가 예약할 하단 인셋을 '실측'으로 발행 — 지도 하단이 시트 peek 상단에 정확히 닿게.
        // peek 상단(viewport Y) = travel - peekPx. 지도영역 하단 = 실제 탭바 top.
        // 예약 = 탭바top - peek상단. (토큰 --tabbar-h/--safe로 계산하면 실제 탭바 높이와 어긋나
        // 지도-시트 사이에 배경 공백이 생긴다 — 탭바 이중계산 버그.)
        const peekTopY = Math.max(0, window.innerHeight - tabbarH - px - h)
        const tabbar = document.querySelector('[class*="tabbar"]') as HTMLElement | null
        const tabbarTop = tabbar?.getBoundingClientRect().top ?? window.innerHeight - tabbarH - px
        const reserve = Math.max(h, tabbarTop - peekTopY)
        document.documentElement.style.setProperty('--map-bottom-reserve', `${reserve}px`)
      }
    }
    measure()
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure) // iOS 주소창 변화
    return () => {
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [])
  const travel = sheetTravelHeight(vh, tabbarH, safeBottom)
  const restY = translateYFor(snap, travel, peekPx)
  const translateY = dragY ?? restY
  // 백드롭 딤은 peek/full 정지 좌표가 둘 다 필요(드래그 진행 0..1로 opacity 구동, 이진 토글 아님).
  const peekRestY = translateYFor('peek', travel, peekPx)
  const fullRestY = translateYFor('full', travel, peekPx)
  const progress = dimProgress(translateY, peekRestY, fullRestY) // 0(peek정지)..1(full정지)

  // 마커 클릭/리스트 탭으로 selectedId가 생기고 시트가 peek면 half로 살짝 올린다(§6 (c)).
  // 이미 half/full이면 사용자가 펼친 상태를 존중(강제로 더 올리거나 내리지 않음).
  useEffect(() => {
    if (selectedId && snap === 'peek') setSnap('half')
  }, [selectedId, snap])

  // 빈/미연결이면 첫 화면이 죽지 않게 half로 자동 오픈(spec §3.3). peek에서만(사용자 펼침 존중).
  // ★ 로딩 '중'에는 판단 보류 — 로딩 순간을 빈 상태로 오판해 장소가 있어도 매번 half로 열리면
  //   시작 화면(내 위치 지도)을 가리고 내 위치 버튼(peek 전용)도 숨긴다.
  const autoHalfRef = useRef(false)
  useEffect(() => {
    if (autoHalfRef.current || placesLoading) return
    const nothingToShow = !coupleActive || places.length === 0
    if (nothingToShow && snap === 'peek') {
      autoHalfRef.current = true
      setSnap('half')
    }
  }, [coupleActive, placesLoading, places.length, snap])

  // 탭 대체(제스처 발견성↓ 보완, ux §1): full이면 한 단계 접고, 아니면 한 단계 펼친다.
  // snap은 controlled(prop) — 함수형 updater 대신 현재 값으로 다음 스냅을 계산해 onSnapChange로 올린다.
  const cycleSnap = () => setSnap(snap === 'full' ? prevSnap(snap) : nextSnap(snap))

  // peekHeader 전체가 드래그 핸들 — pointerdown에서 시작점/기준 translateY를 저장하고,
  // 6px 임계를 넘기 전까지는 탭으로 본다(탭=cycleSnap). 임계 초과 시 dragY 갱신 + 속도 샘플링.
  // 단, 필터 칩 행(role=group)은 헤더의 자식이라 칩 탭의 pointerdown→pointerup이 헤더로 버블한다 —
  // 가드 없으면 no-move 분기가 cycleSnap을 불러 '필터 선택'이 시트 단계까지 바꾼다. 칩에서 시작한
  // 포인터는 드래그/탭 어느 쪽도 트리거하지 않게 dragInfo를 비우고 무시한다(드래그 표면에서 칩 제외).
  const onHeaderPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-no-sheet-drag]')) {
      dragInfo.current = null
      return
    }
    dragInfo.current = {
      pointerY: e.clientY,
      baseY: restY,
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
      moved: false,
    }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onHeaderPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragInfo.current
    if (!d) return
    const dy = e.clientY - d.pointerY
    if (!d.moved && Math.abs(dy) < DRAG_THRESHOLD) return // 임계 미만 = 아직 탭
    if (!d.moved) {
      d.moved = true
      sheetRef.current?.style.setProperty('transition', 'none')
      backdropRef.current?.style.setProperty('transition', 'none') // 딤도 손가락 1:1 추종
    }
    const dt = Math.max(1, e.timeStamp - d.lastT)
    d.velocity = (e.clientY - d.lastY) / dt
    d.lastY = e.clientY
    d.lastT = e.timeStamp
    const next = Math.max(0, Math.min(travel, d.baseY + dy))
    setDragY(next)
  }
  const onHeaderPointerUp = () => {
    const d = dragInfo.current
    sheetRef.current?.style.removeProperty('transition')
    backdropRef.current?.style.removeProperty('transition') // 정착 시 딤 transition 복원
    if (d && d.moved && dragY != null) {
      setSnap(snapForFlick(dragY, d.velocity, travel, peekPx))
      // 드래그였음을 표시 → 뒤이어 오는 synthetic click(cycleSnap)을 1회 무시.
      justDraggedRef.current = true
      // dragInfo.current는 여기서 null이 되지만, justDraggedRef는 click이 발화한 뒤 해제한다.
      setTimeout(() => {
        justDraggedRef.current = false
      }, 0)
    } else if (d && !d.moved) {
      cycleSnap() // 임계 미만 = 탭(헤더에서 직접 처리)
      // 핸들 버튼 직접 탭도 pointerup이 헤더로 버블 → 여기서 cycleSnap이 먼저 돈다. 뒤이어 오는
      // 버튼 onClick(또 cycleSnap)을 1회 삼키지 않으면 한 단계 더 튄다(이중 cycle). 드래그 경로와
      // 동일하게 justDraggedRef로 가드한다(pointerup → click 순서, 다음 tick에 해제).
      justDraggedRef.current = true
      setTimeout(() => {
        justDraggedRef.current = false
      }, 0)
    }
    setDragY(null)
    dragInfo.current = null
  }

  // body 제스처(네이티브 시트 근사) — full 미만: 리스트 스크롤 대신 위로 끌면 펼치고 아래로 끌면 접는다
  // (iOS 지도앱 패턴). full: 리스트가 스크롤하고, scrollTop===0에서 아래로 끌면 한 단계 접기.
  const onBodyPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (snap !== 'full' || (bodyRef.current?.scrollTop ?? 0) <= 0) bodyDrag.current = { y: e.clientY }
  }
  const onBodyPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const b = bodyDrag.current
    if (!b) return
    const dy = e.clientY - b.y
    if (dy > DRAG_THRESHOLD && (bodyRef.current?.scrollTop ?? 0) <= 0) {
      setSnap(prevSnap(snap)) // 아래로 끌면 한 단계 접기
      bodyDrag.current = null
    } else if (-dy > DRAG_THRESHOLD && snap !== 'full') {
      setSnap(nextSnap(snap)) // full 미만에서 위로 끌면 한 단계 펼치기
      bodyDrag.current = null
    }
  }
  const onBodyPointerUp = () => {
    bodyDrag.current = null
  }
  const handleLabel = snap === 'full' ? '시트 단계 전환(접기)' : '시트 펼치기'

  return (
    <>
      {/* 지도 위 백드롭 — 항상 렌더해 드래그 진행(progress 0..1)으로 딤이 페이드(이진 토글 아님).
          탭하면 peek로 collapse(z 44, 시트 45 아래·탭바 46 아래). peek 정지(progress=0)면 클릭 비활성. */}
      <button
        ref={backdropRef}
        type="button"
        className={styles.backdrop}
        aria-label="시트 접기"
        onClick={() => setSnap('peek')}
        style={{ opacity: progress * 0.28, pointerEvents: progress > 0 ? 'auto' : 'none' }}
      />
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="region"
        aria-label="장소 시트"
        style={{ transform: `translateY(${translateY}px)` }}
      >
      {/* peek-pinned 헤더 — peek 비율에서도 항상 보임: 핸들 + 요약 + 필터 칩(§5 peek 콘텐츠).
          헤더 전체가 드래그 핸들(6px 임계로 탭/드래그 구분). 버튼은 키보드/접근성 탭 대체. */}
      <div
        ref={peekRef}
        className={styles.peekHeader}
        data-peek-pinned="true"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <div className={styles.handleRow}>
          <span className={styles.handle} aria-hidden />
          <button
            type="button"
            className={styles.handleBtn}
            onClick={() => {
              if (justDraggedRef.current) return // 방금 드래그 → cycleSnap 중복 방지
              cycleSnap()
            }}
            aria-expanded={snap !== 'peek'}
            aria-label={handleLabel}
          >
            <span className={styles.summary}>
              {placesLoading ? '불러오는 중…' : `우리 장소 ${places.length}곳`}
            </span>
          </button>
        </div>

        {coupleActive && !detailMode ? (
          // data-no-sheet-drag: 칩 탭/가로 스크롤이 헤더 드래그/cycleSnap을 트리거하지 않게 표시(위 가드).
          // 상세 모드에서는 칩을 숨겨 상세에 집중(T18) — 닫으면 다시 렌더.
          <div className={styles.filterRow} role="group" aria-label="장소 필터" data-no-sheet-drag>
            {(
              [
                ['all', '전체'],
                ['wish', '가고싶은'],
                ['visited', '가본'],
              ] as const
            ).map(([key, label]) => {
              const on = effectiveCollId === null && placeFilter === key
              return (
                <button
                  key={key}
                  type="button"
                  className={`${styles.filterChip} ${on ? styles.filterOn : ''}`}
                  aria-pressed={on}
                  onClick={() => {
                    setPlaceFilter(key)
                    setActiveCollId(null)
                  }}
                >
                  {label}
                </button>
              )
            })}
            {/* 사용자 정의 컬렉션 칩(가산) — 내장 칩과 같은 행. 탭하면 그 목록으로 필터(토글). */}
            {collections.map((c) => {
              const on = effectiveCollId === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`${styles.filterChip} ${on ? styles.filterOn : ''}`}
                  aria-pressed={on}
                  onClick={() => setActiveCollId(on ? null : c.id)}
                >
                  {c.name}
                </button>
              )
            })}
            <button
              type="button"
              className={styles.manageChip}
              aria-label="목록 관리"
              onClick={() => setManagerOpen(true)}
            >
              ＋ 목록
            </button>
          </div>
        ) : null}
      </div>

      {!coupleActive ? (
        <div
          ref={bodyRef}
          className={styles.body}
          data-sheet-body
          style={bodyStyleFor(snap)}
          onPointerDown={onBodyPointerDown}
          onPointerMove={onBodyPointerMove}
          onPointerUp={onBodyPointerUp}
        >
          <EmptyState
            emoji="💑"
            title="먼저 상대와 연결해요"
            hint="'우리' 탭에서 초대 코드로 연결하면, 둘이 함께 장소를 모을 수 있어요."
            action={
              <Link className={styles.emptyAction} to="/us">
                우리 탭에서 연결하기
              </Link>
            }
          />
        </div>
      ) : (
        <div
          ref={bodyRef}
          className={`${styles.body} ${detailMode ? styles.bodyDetail : ''}`}
          data-sheet-body
          style={bodyStyleFor(snap)}
          onPointerDown={onBodyPointerDown}
          onPointerMove={onBodyPointerMove}
          onPointerUp={onBodyPointerUp}
        >
          {detailMode ? (
            // 상세 모드(R1.6, T18) — 상세를 body 전체로 두고 목록은 렌더하지 않는다. 닫기(✕/onCloseDetail)는
            // MapPage에서 selectedId·previewHit를 비워 detailMode를 풀고 목록을 복귀시킨다.
            <>
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
                      markVisited.mutate(
                        {
                          placeId: selectedPlace.id,
                          alreadyVisited: visitedIds.has(selectedPlace.id),
                        },
                        {
                          onSuccess: () => {
                            toast.show('가봤어요로 기록했어요 ✅')
                            haptic() // 기록 성공 피드백 — 토스트 시각 피드백 병행(ux §1).
                          },
                        },
                      )
                  }}
                  onUnvisit={() =>
                    unmarkVisited.mutate(
                      { placeId: selectedPlace.id },
                      {
                        onSuccess: (r) => {
                          // removed → 훅이 '되돌리기' Undo 토스트를 띄움(Task 18, 중복 토스트 방지).
                          if (r.status === 'removed') haptic() // 제거 성공에만 — noop/conflict엔 미발화(ux §1).
                          if (r.status === 'noop') toast.show('이미 취소된 기록이에요')
                          // conflict → ConflictBanner는 onConflict가 이미 띄움
                        },
                      },
                    )
                  }
                  onReact={() => {
                    toggleReaction.mutate({ placeId: selectedPlace.id })
                    haptic() // 낙관적 시점 — 시각(하트 칩 토글) 피드백 병행(ux §1).
                  }}
                  collections={collections}
                  memberCollIds={memberCollectionIdSet(placeCollections, selectedPlace.id)}
                  onToggleCollection={(collId) => {
                    const inIt = memberCollectionIdSet(placeCollections, selectedPlace.id).has(collId)
                    if (inIt)
                      removeFromCollection.mutate({ placeId: selectedPlace.id, collectionId: collId })
                    else addToCollection.mutate({ placeId: selectedPlace.id, collectionId: collId })
                    haptic() // 낙관적 시점 — 시각(목록 칩 토글) 피드백 병행(ux §1).
                  }}
                  onManageCollections={() => setManagerOpen(true)}
                  onClose={onCloseDetail}
                />
              ) : null}

              {conflict.conflict ? <ConflictBanner onDismiss={conflict.clear} /> : null}
            </>
          ) : (
            <>
              {conflict.conflict ? <ConflictBanner onDismiss={conflict.clear} /> : null}

              <PlaceList
                visible={visible}
                wishes={wishes}
                visitedIds={visitedIds}
                placesLoading={placesLoading}
                placeFilter={effectiveCollId ? 'collection' : placeFilter}
                selectedId={selectedId}
                onSelect={onSelect}
                setPriority={setPriority}
                priorityPending={priorityPending}
                markVisited={markVisited}
                onUnvisit={(placeId) =>
                  unmarkVisited.mutate(
                    { placeId },
                    {
                      onSuccess: (r) => {
                        // removed → 훅이 '되돌리기' Undo 토스트를 띄움(Task 18, 중복 토스트 방지).
                        if (r.status === 'noop') toast.show('이미 취소된 기록이에요')
                      },
                    },
                  )
                }
                unvisitPending={unmarkVisited.isPending}
                deletePlace={deletePlace}
                deletePending={deletePending}
                onToast={toast.show}
                onToastAction={toast.show}
                restorePlace={restorePlace}
              />
            </>
          )}

          {/* 여행 섹션은 코드 보존하되 시트에서 숨김(spec §3.4). 휴지통은 '우리' 탭으로 이동(Task 12). */}
        </div>
      )}
      </div>
      <CollectionManager
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        collections={collections}
        onCreate={(name) => createCollection.mutate({ name })}
        onRename={(id, version, name) => renameCollection.mutate({ id, version, name })}
        onDelete={(id, version) => deleteCollection.mutate({ id, version })}
        busy={
          createCollection.isPending || renameCollection.isPending || deleteCollection.isPending
        }
      />
    </>
  )
}
