import { useMemo, useState } from 'react'
import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { EmptyState } from '@/components/common/EmptyState'
import { NaverMap } from '@/components/map/NaverMap'
import { PlaceSheet } from '@/components/places/PlaceSheet'
import { MapSearchOverlay } from '@/components/places/MapSearchOverlay'
import { isNaverMapConfigured } from '@/lib/naver/loadNaverMaps'
import { useAuth } from '@/state/auth'
import { useCouple } from '@/hooks/useCouple'
import { usePlaces } from '@/hooks/usePlaces'
import { useProfiles } from '@/hooks/useProfiles'
import { useWishes } from '@/hooks/useWishes'
import { useVisits, useMarkVisited } from '@/hooks/useVisits'
import { useReactions, useToggleReaction } from '@/hooks/useReactions'
import { useRealtimePlaces } from '@/hooks/useRealtimePlaces'
import { attachAndSortWishes } from '@/lib/places/wishStatus'
import { openDirections } from '@/lib/places/directionsUrl'
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
  const { data: profiles } = useProfiles(coupleId)
  const { data: wishes } = useWishes(coupleId, myId)
  const { data: visits } = useVisits(coupleId)
  const { data: reactions } = useReactions(coupleId, myId)
  useRealtimePlaces(coupleId) // 상대가 추가하면 지도/시트 즉시 갱신(여기 한 곳에서만 구독)

  const enriched = useMemo(
    () => attachAndSortWishes(places ?? [], wishes?.byPlace ?? {}, myId),
    [places, wishes, myId],
  )
  const visitedIds = useMemo(() => new Set((visits ?? []).map((v) => v.place_id)), [visits])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const toggleReaction = useToggleReaction(coupleId, myId)
  const markVisited = useMarkVisited(coupleId, myId)
  const onAction = (action: string, id: string) => {
    const p = enriched.find((pl) => pl.id === id)
    if (action === 'directions') {
      if (p && typeof p.lat === 'number' && typeof p.lng === 'number') {
        openDirections({ lat: p.lat, lng: p.lng, name: p.name })
      }
    } else if (action === 'visit') {
      // 이미 가봤음이면 중복 방문 insert 금지(spec §3 원탭 1건). 말풍선도 비활성 상태로 렌더되지만 이중 가드.
      if (!visitedIds.has(id)) markVisited.mutate({ placeId: id })
    } else if (action === 'react') {
      toggleReaction.mutate({ placeId: id })
    }
  }

  return (
    <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId} fullBleed>
      {isNaverMapConfigured() ? (
        <div className={styles.mapWrap}>
          {/* 검색바는 시트가 아니라 지도 위 상단 오버레이(spec §5) — peek에서도 도달, ≤3탭 보존. */}
          {coupleActive ? <MapSearchOverlay coupleId={coupleId} /> : null}
          <NaverMap
            places={enriched}
            visitedIds={visitedIds}
            profiles={profiles ?? {}}
            myId={myId}
            reactions={reactions}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onClose={() => setSelectedId(null)}
            onAction={onAction}
          />
        </div>
      ) : (
        <EmptyState
          emoji="🗺️"
          title="지도 준비 중이에요"
          hint="네이버 지도 키를 설정하면 여기에 우리 장소가 마커로 떠요."
        />
      )}
      <PlaceSheet
        coupleId={coupleId}
        myId={myId}
        coupleActive={coupleActive}
        places={enriched}
        wishes={wishes}
        visits={visits ?? []}
        visitedIds={visitedIds}
        profiles={profiles ?? {}}
        placesLoading={placesLoading}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
    </ScreenScaffold>
  )
}
