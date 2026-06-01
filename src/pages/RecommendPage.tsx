import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { EmptyState } from '@/components/common/EmptyState'

// ✨ 추천 — 데이터가 쌓이면 살아나는 탭(설계서 §5.6). P4에서 지역 클러스터링·AI 경로 구현.
// 콜드스타트 보완: 데이터 없을 때 '죽은 탭'이 되지 않게 안내(§8 다층 빈 상태).
export default function RecommendPage() {
  return (
    <ScreenScaffold title="추천" subtitle="모이면 코스를 짜드려요" testId="page-discover">
      <EmptyState
        emoji="✨"
        title="같은 지역 가고싶은 곳이 모이면 추천이 시작돼요"
        hint="한 지역에 3~5곳이 쌓이면 AI가 일자별 코스를 제안해요."
      />
    </ScreenScaffold>
  )
}
