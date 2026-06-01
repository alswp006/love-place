import { TabScreen } from '@/pages/TabScreen'
import { tabByPath } from '@/app/tabs'

// ✨ 추천 — 데이터가 쌓이면 살아나는 탭(설계서 §5.6). P4에서 지역 클러스터링·AI 경로로 확장.
export default function RecommendPage() {
  return <TabScreen tab={tabByPath('/discover')} />
}
