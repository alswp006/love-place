import { TabScreen } from '@/pages/TabScreen'
import { tabByPath } from '@/app/tabs'

// 📅 일정 — 3트랙 공유 캘린더(설계서 §5.1). P2에서 월/주/일/아젠다·색 도출로 확장.
export default function CalendarPage() {
  return <TabScreen tab={tabByPath('/calendar')} />
}
