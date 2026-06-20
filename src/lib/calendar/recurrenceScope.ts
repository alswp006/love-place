// 반복 일정 3-범위(이 일정만/이후/전체) 연산 — 순수 함수. 'all'은 시리즈 plain update(여기 없음).
import { parseRule, buildRule } from './rrule'
import { dayKey } from './eventDays'

/** '이 일정만' 삭제/오버라이드: 해당 occurrence dayKey를 시리즈 EXDATE에 추가한 RRULE 반환. */
export function exdateOccurrence(rule: string, occDayKey: string): string {
  const p = parseRule(rule)
  if (!p) return rule
  const ex = new Set(p.exdates)
  ex.add(occDayKey)
  return buildRule(p.freq, p.interval, p.count, Array.from(ex).sort(), p.until)
}

export type SplitResult = { truncatedRule: string; newSeriesStartKey: string }

/** '이후': 분할 occurrence(occStartIso) 직전까지로 시리즈를 절단(UNTIL)하고, 분할일을 새 시리즈 시작키로. */
export function splitFollowing(rule: string, occStartIso: string): SplitResult {
  const p = parseRule(rule)
  if (!p) return { truncatedRule: rule, newSeriesStartKey: dayKey(occStartIso) }
  // 분할 occurrence 시작 1ms 전을 UNTIL로(그 회차는 새 시리즈가 가져감). COUNT는 제거(UNTIL이 절단).
  const until = new Date(new Date(occStartIso).getTime() - 1).toISOString()
  const truncatedRule = buildRule(p.freq, p.interval, undefined, p.exdates, until)
  return { truncatedRule, newSeriesStartKey: dayKey(occStartIso) }
}
