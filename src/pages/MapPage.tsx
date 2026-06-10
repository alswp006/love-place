import { useMemo } from 'react'
import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { EmptyState } from '@/components/common/EmptyState'
import { NaverMap } from '@/components/map/NaverMap'
import { TodayCard } from '@/components/common/TodayCard'
import { isNaverMapConfigured } from '@/lib/naver/loadNaverMaps'
import { useAuth } from '@/state/auth'
import { useCouple } from '@/hooks/useCouple'
import { usePlaces } from '@/hooks/usePlaces'
import { useWishes } from '@/hooks/useWishes'
import { useVisits } from '@/hooks/useVisits'
import { useRealtimePlaces } from '@/hooks/useRealtimePlaces'
import { attachAndSortWishes } from '@/lib/places/wishStatus'
import { tabByPath } from '@/app/tabs'
import styles from './MapPage.module.css'

// 🗺️ 지도 — 첫 화면(§5.5). 네이버 지도 + 저장한 장소 마커. 둘 다 찜은 모양/색 이중화(§8).
export default function MapPage() {
  const tab = tabByPath('/') // 지도 = index 탭
  const { user } = useAuth()
  const myId = user?.id ?? null
  const { data: couple } = useCouple()
  const coupleId = couple?.coupleId ?? null
  const { data: places } = usePlaces(coupleId)
  const { data: wishes } = useWishes(coupleId, myId)
  const { data: visits } = useVisits(coupleId)
  useRealtimePlaces(coupleId) // 상대가 추가하면 지도도 즉시 갱신

  // useMemo로 참조 안정화 — 매 렌더 새 배열이면 NaverMap이 마커를 불필요하게 재드로우(깜빡임).
  // 훅은 조기 반환보다 위에서 무조건 호출(Rules of Hooks).
  const enriched = useMemo(
    () => attachAndSortWishes(places ?? [], wishes?.byPlace ?? {}, myId),
    [places, wishes, myId],
  )
  const visitedIds = useMemo(() => new Set((visits ?? []).map((v) => v.place_id)), [visits])

  return (
    <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
      <TodayCard coupleId={coupleId} />
      {isNaverMapConfigured() ? (
        <div className={styles.mapWrap}>
          <NaverMap places={enriched} visitedIds={visitedIds} />
        </div>
      ) : (
        <EmptyState
          emoji="🗺️"
          title="지도 준비 중이에요"
          hint="네이버 지도 키를 설정하면 여기에 우리 장소가 마커로 떠요."
        />
      )}
    </ScreenScaffold>
  )
}
