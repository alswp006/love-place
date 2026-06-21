import { formatTime } from './eventDays'

// 이벤트가 다른 tz로 저장됐을 때만 로컬시각 노트(여행 현지시각). 같으면 null(노출 안 함).
export function tzNote(iso: string, eventTz: string, displayTz: string): string | null {
  if (!eventTz || eventTz === displayTz) return null
  return `이 일정은 ${eventTz} 기준 ${formatTime(iso, eventTz)}`
}
