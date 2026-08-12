import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useEvents } from '@/hooks/useEvents'
import { useActivityFeed } from '@/hooks/useActivityFeed'
import { buildUpcomingFeed } from '@/lib/calendar/upcomingFeed'
import { UpcomingFeed } from '@/components/common/UpcomingFeed'
import { ActivityFeed } from '@/components/common/ActivityFeed'
import styles from './SignalStrip.module.css'

// 둘 사이의 신호를 **한 줄로 접어** 지도 위에 둔다.
//
// 왜 여기인가: 지도가 첫 화면이라 신호를 볼 유일하게 확실한 자리다. 그런데 지도 탭의 주인공은
// 지도이므로 카드를 펼쳐 두면 방해가 된다. 그래서 평소엔 한 줄, 탭하면 원래 카드가 펼쳐진다.
// (MapPage에 이 의도의 주석과 .feedOverlay 자리가 예전부터 있었는데 렌더가 빠져 있었다 —
//  UpcomingFeed·ActivityFeed 둘 다 만들어 놓고 어디에도 안 붙인 상태였다.)
//
// 왜 필요한가: 웹푸시는 iOS에서 PWA 홈화면+16.4 이상에서만 동작한다. 즉 "상대가 장소를 담았어요",
// "○○ 여행 D-3" 같은 신호를 놓치지 않으려면 **앱 안에** 1차 수단이 있어야 한다(ux §6).
//
// 규약: 신호가 0건이면 통째로 사라진다(죽은 UI 금지). 배지·숫자만 남기고 내용을 감추지 않는다.
export function SignalStrip({ coupleId, myId }: { coupleId: string | null; myId: string | null }) {
  const { data: events } = useEvents(coupleId)
  const { data: activity } = useActivityFeed(coupleId, myId)
  const [now, setNow] = useState(() => new Date().toISOString())
  const [open, setOpen] = useState(false)

  // 1분 틱 — '10분 뒤' 같은 라벨이 굳지 않게(펼친 카드들과 같은 패턴).
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString()), 60000)
    return () => clearInterval(t)
  }, [])

  const upcoming = buildUpcomingFeed(events ?? [], now, myId)
  const acts = activity ?? []
  const total = upcoming.length + acts.length
  if (total === 0) return null

  // 한 줄에 무엇을 띄울까 — 급한 것부터. 곧 시작하는 일정 > 상대의 최근 활동 > 다가오는 D-day.
  // (여러 개를 줄여 붙이면 아무것도 안 읽힌다. 하나만 또렷하게 보이고 나머지는 +N으로 센다.)
  const imminent = upcoming.find((u) => u.kind === 'imminent')
  const lead = imminent
    ? { icon: 'bell' as const, text: `${imminent.label} · ${imminent.title}` }
    : acts[0]
      ? { icon: 'sparkles' as const, text: acts[0].text }
      : { icon: 'calendar' as const, text: `${upcoming[0]!.label} · ${upcoming[0]!.title}` }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.pill}
        aria-expanded={open}
        aria-controls="signal-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.icon} aria-hidden>
          <Icon name={lead.icon} />
        </span>
        <span className={styles.text}>{lead.text}</span>
        {total > 1 ? (
          // 숫자만으로 말하지 않는다 — 스크린리더엔 '외 N건'으로 읽힌다(§8).
          <span className={styles.more}>
            <span aria-hidden>+{total - 1}</span>
            <span className={styles.sr}>외 {total - 1}건</span>
          </span>
        ) : null}
        <span className={styles.chevron} data-open={open ? 'true' : undefined} aria-hidden>
          <Icon name="chevron" />
        </span>
      </button>

      {open ? (
        <div className={styles.panel} id="signal-panel">
          <UpcomingFeed coupleId={coupleId} myId={myId} />
          <ActivityFeed coupleId={coupleId} myId={myId} />
        </div>
      ) : null}
    </div>
  )
}
