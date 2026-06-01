import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { EmptyState } from '@/components/common/EmptyState'

// 🗺️ 지도 — 첫 화면(설계서 §5.5). P1c에서 카카오맵 JS SDK·별표 마커 구현.
export default function MapPage() {
  return (
    <ScreenScaffold title="지도" subtitle="우리가 가고 싶은 곳과 가봤던 곳" testId="page-map">
      <EmptyState
        emoji="🗺️"
        title="아직 지도에 표시할 장소가 없어요"
        hint="장소 탭에서 첫 가고싶은 곳을 추가하면 여기 별표로 떠요."
      />
    </ScreenScaffold>
  )
}
