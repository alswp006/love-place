// 반복 일정 3-범위(이 일정만/이후/전체) 연산 — 순수 함수. 'all'은 시리즈 plain update(여기 없음).
import { parseRule, buildRule } from './rrule'
import { dayKey, diffDays } from './eventDays'

const DAY_MS = 86_400_000

/**
 * override/새 시리즈용 시각 보정: 폼 start/end(=시리즈 앵커 날에 사용자가 고른 벽시계 시각)를
 * 클릭한 occurrence 날짜(occDayKey)로 통째로 이동한다. 벽시계 시각·기간은 보존(일수만 평행이동).
 * Asia/Seoul 고정 오프셋(DST 없음)이라 N일 ms 가산이 벽시계 시각을 흔들지 않는다.
 * (시리즈 앵커가 아닌 회차를 편집할 때 override가 앵커 날에 잘못 떨어지는 버그 방어 — 조사 01 §3/§6.)
 */
export function shiftTimesToOccurrence(
  start: string,
  end: string,
  occDayKey: string,
): { start: string; end: string } {
  const delta = diffDays(dayKey(start), occDayKey) * DAY_MS
  if (delta === 0) return { start, end }
  return {
    start: new Date(new Date(start).getTime() + delta).toISOString(),
    end: new Date(new Date(end).getTime() + delta).toISOString(),
  }
}

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
