import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { EmptyState } from '@/components/common/EmptyState'
import { NaverMap } from '@/components/map/NaverMap'
import { isNaverMapConfigured } from '@/lib/naver/loadNaverMaps'
import { useCouple } from '@/hooks/useCouple'
import { usePlaces } from '@/hooks/usePlaces'
import { tabByPath } from '@/app/tabs'
import styles from './MapPage.module.css'

// 🗺️ 지도 — 첫 화면(§5.5). 네이버 지도 + 저장한 장소 별표 마커.
export default function MapPage() {
  const tab = tabByPath('/') // 지도 = index 탭
  const { data: couple } = useCouple()
  const coupleId = couple?.coupleId ?? null
  const { data: places } = usePlaces(coupleId)

  if (!isNaverMapConfigured()) {
    return (
      <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
        <EmptyState
          emoji="🗺️"
          title="지도 준비 중이에요"
          hint="네이버 지도 키를 설정하면 여기에 우리 장소가 별표로 떠요."
        />
      </ScreenScaffold>
    )
  }

  return (
    <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
      <div className={styles.mapWrap}>
        <NaverMap places={places ?? []} />
      </div>
    </ScreenScaffold>
  )
}
