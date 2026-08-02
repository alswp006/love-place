import { useEffect, useState } from 'react'
import { useActivityFeed } from '@/hooks/useActivityFeed'
import { useProfiles } from '@/hooks/useProfiles'
import { SourceAvatar } from '@/components/common/SourceAvatar'
import { relativeLabel } from '@/lib/feed/activityFeed'
import styles from './ActivityFeed.module.css'

// 인앱 활동 피드 — iOS 웹푸시 제약 때문에 이게 1차 알림 수단이다(ux §6).
// "상대가 방금 뭘 했는지"만 보여준다. 팔로우·타임라인·알림 유입 같은 소셜 확장은 하지 않는다(§2).
// 항목이 0이면 카드를 아예 감춘다(죽은 카드 금지) — UpcomingFeed와 같은 규약.
export function ActivityFeed({ coupleId, myId }: { coupleId: string | null; myId: string | null }) {
  const { data: items } = useActivityFeed(coupleId, myId)
  const { data: profiles } = useProfiles(coupleId)
  const [now, setNow] = useState(() => new Date().toISOString())

  // 상대 시간 라벨이 굳지 않게 1분 틱(UpcomingFeed와 동일 패턴).
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString()), 60000)
    return () => clearInterval(t)
  }, [])

  const list = items ?? []
  if (list.length === 0) return null

  return (
    <section className={styles.card} aria-label="상대의 최근 활동">
      <h2 className={styles.head}>상대의 최근 활동</h2>
      {/* Realtime이 아니라 폴링에 가깝지만, 갱신 시 스크린리더가 놓치지 않게 알린다. */}
      <ul className={styles.list} aria-live="polite">
        {list.map((i) => (
          <li key={i.id} className={styles.item}>
            <SourceAvatar userId={i.actorId} profiles={profiles ?? {}} myId={myId} context=" 활동" />
            <span className={styles.text}>{i.text}</span>
            <span className={styles.time}>{relativeLabel(i.createdAt, now)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
