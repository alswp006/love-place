import { TabScreen } from '@/pages/TabScreen'
import { tabByPath } from '@/app/tabs'

// 🗺️ 지도 — 첫 화면(설계서 §5.5). P1c에서 카카오맵 JS SDK·별표 마커로 확장(무거워 별도 청크 유지).
export default function MapPage() {
  return <TabScreen tab={tabByPath('/')} />
}
