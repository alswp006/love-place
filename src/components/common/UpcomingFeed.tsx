import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Link } from 'react-router-dom'
import { useEvents } from '@/hooks/useEvents'
import { useProfiles } from '@/hooks/useProfiles'
import { buildUpcomingFeed } from '@/lib/calendar/upcomingFeed'
import { TRACK_META } from '@/lib/calendar/track'
import { SourceAvatar } from '@/components/common/SourceAvatar'
import styles from './UpcomingFeed.module.css'

// 다가오는 일정 인앱 피드 카드(Task 15) — TodayCard 승격. 첫 화면(지도) 상단의 경량 활동 신호.
// 안 울리는 리마인더를 인앱 신호로: 웹푸시는 PWA 홈화면+iOS16.4 후속, 인앱 피드가 1차 알림 수단(ux §6).
// now 틱(1분)으로 '곧 시작' 카운트다운 갱신, 항목 0이면 self-hide(죽은 카드 금지).
export function UpcomingFeed({ coupleId, myId }: { coupleId: string | null; myId: string | null }) {
  const { data: events } = useEvents(coupleId)
  const { data: profiles } = useProfiles(coupleId)
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
            {/* 신호를 봤으면 갈 수 있어야 한다 — 그 날짜 아젠다로. */}
            <Link className={styles.row} to={`/calendar?date=${i.dayKey}`}>
              <span className={styles.badge} aria-hidden>
                {i.kind === 'imminent' ? (
                  <Icon name={i.soft ? 'clock' : 'bell'} />
                ) : (
                  <Icon name="calendar" />
                )}
              </span>
              <span className={styles.label}>
                {i.kind === 'imminent' && i.soft ? `곧 시작 · ${i.label}` : i.label}
              </span>
              <span className={styles.title}>{i.title}</span>
              {/* 누구 일정인지 — 색만 쓰지 않고 아바타 + 심볼(●▲■)+라벨로 이중화(§8).
                  상대의 PERSONAL 일정이 출처 없이 섞여 뜨던 것을 막는다. */}
              <SourceAvatar userId={i.ownerId} profiles={profiles ?? {}} myId={myId} context=" 일정" />
              <span className={styles.track} style={{ color: TRACK_META[i.track].cssVar }}>
                {TRACK_META[i.track].symbol} {TRACK_META[i.track].label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
