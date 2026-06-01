import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { EmptyState } from '@/components/common/EmptyState'

// 📍 장소 — 위시리스트·방문 기록의 본진(설계서 §5.2~§5.4). P1b에서 카카오 자동완성 저장 구현.
export default function PlacesPage() {
  return (
    <ScreenScaffold title="장소" subtitle="가고싶은 곳 · 가본 곳" testId="page-places">
      <EmptyState
        emoji="📍"
        title="첫 가고싶은 장소를 추가해보세요"
        hint="검색 한 줄이면 끝 — 이름·주소·좌표가 한 번에 저장돼요."
      />
    </ScreenScaffold>
  )
}
