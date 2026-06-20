import { useEffect, useMemo, useState } from 'react'
import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { EmptyState } from '@/components/common/EmptyState'
import { NaverMap } from '@/components/map/NaverMap'
import { PlaceSheet } from '@/components/places/PlaceSheet'
import { MapSearchOverlay } from '@/components/places/MapSearchOverlay'
import { isNaverMapConfigured } from '@/lib/naver/loadNaverMaps'
import { useAuth } from '@/state/auth'
import { useCouple } from '@/hooks/useCouple'
import { usePlaces } from '@/hooks/usePlaces'
import { useWishes } from '@/hooks/useWishes'
import { useVisits } from '@/hooks/useVisits'
import { useConflict } from '@/lib/sync/useConflict'
import { ConflictBanner } from '@/components/common/ConflictBanner'
import { useReactions } from '@/hooks/useReactions'
import { useRealtimePlaces } from '@/hooks/useRealtimePlaces'
import { attachAndSortWishes } from '@/lib/places/wishStatus'
import { useSavePlace } from '@/hooks/useSavePlace'
import { useToast } from '@/components/common/ToastProvider'
import type { KakaoPlaceHit } from '@/lib/kakao/types'
import { type SnapStop } from '@/lib/places/sheetSnap'
import { tabByPath } from '@/app/tabs'
import styles from './MapPage.module.css'

// 🗺️ 지도 — 첫 화면이자 장소 통합 오케스트레이터(§5.5). 네이버 지도 + 드래그 시트.
// 훅을 여기서 한 번만 호출하고(중복 realtime 구독 방지) selectedId를 지도/시트가 공유.
export default function MapPage() {
  const tab = tabByPath('/') // 지도 = index 탭
  const { user } = useAuth()
  const myId = user?.id ?? null
  const { data: couple } = useCouple()
  const coupleId = couple?.coupleId ?? null
  const coupleActive = couple?.status === 'ACTIVE'
  const { data: places, isLoading: placesLoading } = usePlaces(coupleId)
  const { data: wishes } = useWishes(coupleId, myId)
  const { data: visits } = useVisits(coupleId)
  const { data: reactions } = useReactions(coupleId, myId)
  useRealtimePlaces(coupleId) // 상대가 추가하면 지도/시트 즉시 갱신(여기 한 곳에서만 구독)

  const enriched = useMemo(
    () => attachAndSortWishes(places ?? [], wishes?.byPlace ?? {}, myId),
    [places, wishes, myId],
  )
  const visitedIds = useMemo(() => new Set((visits ?? []).map((v) => v.place_id)), [visits])
  const savedKakaoIds = useMemo(
    () => new Set((places ?? []).map((p) => p.kakao_place_id).filter((x): x is string => x != null)),
    [places],
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewHit, setPreviewHit] = useState<KakaoPlaceHit | null>(null)
  // 시트 snap을 MapPage로 끌어올려 NaverMap(플로팅 버튼/토스트 숨김)과 PlaceSheet가 같은 값을 읽게 한다.
  const [snap, setSnap] = useState<SnapStop>('peek')
  const savePlace = useSavePlace(coupleId)
  const toast = useToast()

  const conflict = useConflict()

  // 검색 결과 탭(spec §3.6): 이미 저장됐으면 기존 마커 선택, 아니면 프리뷰 띄움(즉시 저장 안 함).
  const onPick = (hit: KakaoPlaceHit) => {
    const existing = enriched.find((p) => p.kakao_place_id === hit.kakaoPlaceId)
    if (existing) {
      setPreviewHit(null)
      setSelectedId(existing.id)
    } else {
      setSelectedId(null)
      setPreviewHit(hit)
    }
  }

  // 시트 프리뷰 저장(말풍선 폐지 — 저장은 시트의 onSave로 일원화, Task 12).
  // 온라인 저장(r): 새 place/기존(jumped) 선택 → 일반 마커로 전환 + 토스트 피드백.
  // 오프라인 큐(r===null): 선택 없이 큐 메시지(spec §3.6).
  const onSheetSave = () => {
    if (!previewHit) return
    savePlace.mutate(previewHit, {
      onSuccess: (r) => {
        setPreviewHit(null)
        if (!r) {
          toast.show('오프라인이라 큐에 담았어요 — 연결되면 저장돼요')
          return
        }
        if (r.jumped) toast.show('이미 담아둔 곳이에요 — 지도에서 보여줄게요')
        else toast.show('저장했어요')
        setSelectedId(r.placeId)
      },
      onError: (e) => toast.show(e.message, 3000),
    })
  }

  // 프리뷰 중 상대가 같은 곳을 저장하면(savedKakaoIds에 등장) 프리뷰→선택 자동 전환.
  // 같은 핀이 프리뷰/일반 마커로 중복 노출되는 깜빡임을 방지(spec §3.6, realtime 전파).
  useEffect(() => {
    if (previewHit && savedKakaoIds.has(previewHit.kakaoPlaceId)) {
      const existing = enriched.find((p) => p.kakao_place_id === previewHit.kakaoPlaceId)
      if (existing) {
        setPreviewHit(null)
        setSelectedId(existing.id)
      }
    }
  }, [previewHit, savedKakaoIds, enriched])

  return (
    <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId} fullBleed>
      {isNaverMapConfigured() ? (
        <div className={styles.mapWrap}>
          {conflict.conflict ? (
            <div className={styles.bannerOverlay}>
              <ConflictBanner onDismiss={conflict.clear} />
            </div>
          ) : null}
          {/* 검색바는 시트가 아니라 지도 위 상단 오버레이(spec §5) — peek에서도 도달, ≤3탭 보존. */}
          {coupleActive ? (
            <MapSearchOverlay coupleId={coupleId} savedKakaoIds={savedKakaoIds} onPick={onPick} snap={snap} />
          ) : null}
          <NaverMap
            places={enriched}
            visitedIds={visitedIds}
            selectedId={selectedId}
            previewHit={previewHit}
            snap={snap}
            onSelect={(id) => {
              setPreviewHit(null)
              setSelectedId(id)
            }}
            onClose={() => {
              setSelectedId(null)
              setPreviewHit(null)
            }}
          />
        </div>
      ) : (
        <EmptyState
          emoji="🗺️"
          title="지도 준비 중이에요"
          hint="네이버 지도 키를 설정하면 여기에 우리 장소가 마커로 떠요."
        />
      )}
      {/* 키 없을 때(준비 중)는 시트를 렌더하지 않아 '준비 중' 안내 1개만 보이게 한다(spec §3.3). */}
      {isNaverMapConfigured() ? (
        <PlaceSheet
          coupleId={coupleId}
          myId={myId}
          coupleActive={coupleActive}
          places={enriched}
          wishes={wishes}
          visitedIds={visitedIds}
          placesLoading={placesLoading}
          selectedId={selectedId}
          onSelect={setSelectedId}
          previewHit={previewHit}
          reactions={reactions}
          onSave={() => onSheetSave()}
          onCloseDetail={() => {
            setSelectedId(null)
            setPreviewHit(null)
          }}
          snap={snap}
          onSnapChange={setSnap}
        />
      ) : null}
    </ScreenScaffold>
  )
}
