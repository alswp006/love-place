import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useEvents } from '@/hooks/useEvents'
import { useActivityFeed } from '@/hooks/useActivityFeed'
import { buildUpcomingFeed } from '@/lib/calendar/upcomingFeed'
import { UpcomingFeed } from './UpcomingFeed'
import { ActivityFeed } from './ActivityFeed'
import styles from './MapNotices.module.css'

// 지도 첫 화면의 알림 묶음 — 다가오는 일정 + 상대의 최근 활동.
//
// 왜 접었나: 둘 다 카드로 펼쳐져 있으면 첫 화면의 절반이 알림이었다. 지도 탭의 주인공은
// 지도이고, 이 둘은 "놓치지 않게 알려주는" 보조 신호다(ux §6 — 웹푸시가 안 되는 자리를 메움).
// 그래서 기본은 한 줄 요약으로 접고, 탭하면 원래 카드가 그대로 펼쳐진다.
// 신호를 없애지 않으면서 자리만 돌려준다 — 0건이면 아예 사라지는 규약은 그대로.
//
// 요약 줄은 '가장 급한 것' 하나를 보여준다: 곧 시작하는 일정 > 다가오는 일정 > 상대 활동.
// 나머지 개수는 +N으로 — 색이 아니라 숫자·텍스트로 말한다(§8).
export function MapNotices({ coupleId, myId }: { coupleId: string | null; myId: string | null }) {
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => new Date().toISOString())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString()), 60000)
    return () => clearInterval(t)
  }, [])

  // 두 피드가 쓰는 쿼리 그대로 — TanStack Query 캐시라 추가 조회가 아니다.
  const { data: events } = useEvents(coupleId)
  const { data: activity } = useActivityFeed(coupleId, myId)

  const upcoming = buildUpcomingFeed(events ?? [], now, myId)
  const acts = activity ?? []
  const total = upcoming.length + acts.length
  if (total === 0) return null

  const imminent = upcoming.find((u) => u.kind === 'imminent')
  const lead = imminent ?? upcoming[0]
  const headline = lead
    ? `${lead.kind === 'imminent' && lead.soft ? '곧 시작' : lead.label} · ${lead.title}`
    : (acts[0]?.text ?? '')
  const rest = total - 1

  if (!open) {
    return (
      <button
        type="button"
        className={styles.pill}
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-label={`알림 ${total}건 펼치기 — ${headline}`}
      >
        <span className={styles.bell} aria-hidden>
          <Icon name={imminent ? 'bell' : 'calendar'} />
        </span>
        <span className={styles.headline}>{headline}</span>
        {rest > 0 ? <span className={styles.more}>+{rest}</span> : null}
        <span className={styles.chevron} aria-hidden>
          ▾
        </span>
      </button>
    )
  }

  return (
    <div className={styles.open}>
      <UpcomingFeed coupleId={coupleId} myId={myId} />
      <ActivityFeed coupleId={coupleId} myId={myId} />
      <button
        type="button"
        className={styles.collapse}
        onClick={() => setOpen(false)}
        aria-expanded
      >
        접기 ▴
      </button>
    </div>
  )
}
