import { TabScreen } from '@/pages/TabScreen'
import { tabByPath } from '@/app/tabs'

// 💑 우리 — 설정·연결·내보내기(설계서 §3, §10). P0b/P0d 초대·연결, P0g 내보내기로 확장.
export default function UsPage() {
  return <TabScreen tab={tabByPath('/us')} />
}
