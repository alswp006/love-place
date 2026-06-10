import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useEvents } from '@/hooks/useEvents'
import { groupByDay, dayKey, formatTime, dDayLabel, upcomingEvents } from '@/lib/calendar/eventDays'
import styles from './TodayCard.module.css'

// 오늘 카드 — 첫 화면(지도) 상단에 오늘 일정 + 다가오는 일정(D-day). 활동 신호의 경량판(둘만의 정체성).
// 오늘 일정도 없고 다가오는 일정도 없으면 숨김(죽은 카드 방지).
export function TodayCard({ coupleId }: { coupleId: string | null }) {
  const { data: events } = useEvents(coupleId)
  const nowIso = new Date().toISOString()
  const todayKey = dayKey(nowIso)

  const todays = useMemo(() => (events ? (groupByDay(events)[todayKey] ?? []) : []), [events, todayKey])
  const next = useMemo(() => {
    const up = events ? upcomingEvents(events, nowIso) : []
    return up.find((e) => dayKey(e.start) !== todayKey) ?? null
  }, [events, nowIso, todayKey])

  if (todays.length === 0 && !next) return null

  return (
    <Link to="/calendar" className={styles.card} aria-label="오늘 일정 보기">
      <div className={styles.head}>📅 오늘</div>
      {todays.length > 0 ? (
        <ul className={styles.list}>
          {todays.slice(0, 3).map((e) => (
            <li key={e.id}>
              <span className={styles.time}>{e.is_all_day ? '종일' : formatTime(e.start)}</span> {e.title}
            </li>
          ))}
          {todays.length > 3 ? <li className={styles.more}>+{todays.length - 3}개 더</li> : null}
        </ul>
      ) : (
        <p className={styles.none}>오늘 일정은 없어요.</p>
      )}
      {next ? (
        <p className={styles.next}>
          다음: <strong>{dDayLabel(dayKey(next.start), todayKey)}</strong> · {next.title}
        </p>
      ) : null}
    </Link>
  )
}
