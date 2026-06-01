import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { EmptyState } from '@/components/common/EmptyState'

// 📅 일정 — 3트랙 공유 캘린더(설계서 §5.1). P2에서 월/주/일/아젠다·색 도출 구현.
export default function CalendarPage() {
  return (
    <ScreenScaffold title="일정" subtitle="나 · 상대 · 함께" testId="page-calendar">
      <EmptyState
        emoji="📅"
        title="첫 일정을 만들어볼까요?"
        hint="나·상대·함께 세 가지 색으로 일정을 겹쳐 봐요."
      />
    </ScreenScaffold>
  )
}
