import { TabScreen } from '@/pages/TabScreen'
import { tabByPath } from '@/app/tabs'

// 📍 장소 — 위시리스트·방문 기록의 본진(설계서 §5.2~§5.4). P1b에서 카카오 자동완성 저장으로 확장.
export default function PlacesPage() {
  return <TabScreen tab={tabByPath('/places')} />
}
