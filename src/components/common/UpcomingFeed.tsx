import { useEffect, useState } from 'react'
import { useEvents } from '@/hooks/useEvents'
import { buildUpcomingFeed } from '@/lib/calendar/upcomingFeed'
import styles from './UpcomingFeed.module.css'

// 다가오는 일정 인앱 피드 카드(Task 15) — TodayCard 승격. 첫 화면(지도) 상단의 경량 활동 신호.
// 안 울리는 리마인더를 인앱 신호로: 웹푸시는 PWA 홈화면+iOS16.4 후속, 인앱 피드가 1차 알림 수단(ux §6).
// now 틱(1분)으로 '곧 시작' 카운트다운 갱신, 항목 0이면 self-hide(죽은 카드 금지).
export function UpcomingFeed({ coupleId, myId }: { coupleId: string | null; myId: string | null }) {
  const { data: events } = useEvents(coupleId)
  const [now, setNow] = useState(() => new Date().toISOString())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString()), 60000) // 1분 틱(곧 시작 카운트다운)
    return () => clearInterval(t)
  }, [])
  const items = buildUpcomingFeed(events ?? [], now, myId)
  if (items.length === 0) return null // 죽은 카드 금지(self-hide)
  return (
    <section className={styles.card} aria-label="다가오는 일정">
      <h2 className={styles.head}>다가오는 일정</h2>
      <ul className={styles.list}>
        {items.map((i) => (
          <li key={i.id} className={styles.item} {...(i.kind === 'imminent' ? { 'aria-live': 'polite' } : {})}>
            <span className={styles.badge} aria-hidden>
              {i.kind === 'imminent' ? (i.soft ? '⏱' : '🔔') : '📅'}
            </span>
            <span className={styles.label}>
              {i.kind === 'imminent' && i.soft ? `곧 시작 · ${i.label}` : i.label}
            </span>
            <span className={styles.title}>{i.title}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
