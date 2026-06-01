import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { EmptyState } from '@/components/common/EmptyState'

// 💑 우리 — 설정·연결·내보내기(설계서 §3, §10). P0b/P0d에서 초대·연결, P0g에서 내보내기 구현.
export default function UsPage() {
  return (
    <ScreenScaffold title="우리" subtitle="프로필 · 연결 · 내보내기" testId="page-us">
      <EmptyState
        emoji="💑"
        title="상대를 초대해 연결해요"
        hint="1회용 초대 코드로 둘만 안전하게 연결돼요. (곧 추가됩니다)"
      />
    </ScreenScaffold>
  )
}
