import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { EmptyState } from '@/components/common/EmptyState'
import { CtaLink } from '@/components/common/CtaLink'
import type { TabDef } from '@/app/tabs'

// 탭 셸의 공통 렌더 — 5개 페이지가 동일 구조였으므로 def 하나로 도출(복붙 제거).
// 각 패킷(P1b 장소, P2 일정 …)에서 해당 탭의 실제 콘텐츠로 확장한다.
export function TabScreen({ tab }: { tab: TabDef }) {
  const { emoji, title, hint, action } = tab.empty
  return (
    <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
      <EmptyState
        emoji={emoji}
        title={title}
        hint={hint}
        action={action ? <CtaLink to={action.to}>{action.label}</CtaLink> : undefined}
      />
    </ScreenScaffold>
  )
}
