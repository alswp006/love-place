import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { EmptyState } from '@/components/common/EmptyState'
import type { TabDef } from '@/app/tabs'

// 탭 셸의 공통 렌더 — 5개 페이지가 동일 구조였으므로 def 하나로 도출(복붙 제거).
// 각 패킷(P1b 장소, P2 일정 …)에서 해당 탭의 실제 콘텐츠로 확장한다.
export function TabScreen({ tab }: { tab: TabDef }) {
  return (
    <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
      <EmptyState emoji={tab.empty.emoji} title={tab.empty.title} hint={tab.empty.hint} />
    </ScreenScaffold>
  )
}
