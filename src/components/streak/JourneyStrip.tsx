import { useMemo, useState } from 'react'
import { useAuth } from '@/state/auth'
import { useCouple } from '@/hooks/useCouple'
import { useEvents } from '@/hooks/useEvents'
import { useEventCompletions } from '@/hooks/useEventCompletions'
import { dailyDoneCounts, recentWeeks, mondayOf, type EventMeta } from '@/lib/streak/garden'
import { constellationOfWeek } from '@/lib/streak/constellations'
import { localDayKey } from '@/lib/journey/autoLink'
import { Constellation, WeekGlyph } from './Constellation'
import { STAR_TARGET_ID } from './flyStar'
import styles from './JourneyStrip.module.css'

// 일정 탭 맨 위 — 이번 주 별자리. 기본은 한 줄, 탭하면 펼쳐진다.
//
// 접어 두는 이유는 지도 알림과 같다: 이 탭의 주인공은 캘린더다.
//
// 별자리로 정한 이유: 앞서 쓰던 '카페→해변' 여정은 우리 데이터와 아무 상관 없는 가짜 서사였다.
// 별자리는 "채운 만큼 하늘에 남는다" 말고 다른 주장을 하지 않고, 캘린더가 이미 쓰는
// 주(週) 리듬을 그대로 쓴다.
//
// categoryId를 받으면 그 분류만 센다 — 캘린더의 카테고리 칩과 같은 축으로 움직인다.
// (undefined = 전체. null = '분류 없음'이라는 하나의 칸.)

export function JourneyStrip({ categoryId }: { categoryId?: string | null }) {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  const { data: couple } = useCouple()
  const coupleId = couple?.coupleId ?? null
  const myId = user?.id ?? null

  const { data: events } = useEvents(coupleId)
  const { data: completions } = useEventCompletions(coupleId)

  const today = localDayKey()

  // 별을 눌러(스크린리더로도) 되짚을 수 있게 — 이 별이 무슨 일정이었는지.
  const titleOf = useMemo(() => {
    const m = new Map((events ?? []).map((e) => [e.id, e.title]))
    return (id: string) => m.get(id)
  }, [events])

  const metaOf = useMemo(() => {
    const m = new Map<string, EventMeta>()
    for (const e of events ?? []) {
      m.set(e.id, { owner_id: e.owner_id, visibility: e.visibility, category_id: e.category_id })
    }
    return (id: string) => m.get(id)
  }, [events])

  const counts = useMemo(
    () =>
      dailyDoneCounts(
        completions ?? [],
        metaOf,
        myId,
        categoryId === undefined ? {} : { categoryId },
      ),
    [completions, metaOf, myId, categoryId],
  )

  const weeks = useMemo(() => recentWeeks(counts, today), [counts, today])
  const thisWeek = weeks[weeks.length - 1]!
  const past = weeks.slice(0, -1)
  const thisMonday = mondayOf(today)
  const shape = constellationOfWeek(thisMonday)
  const left = Math.max(0, thisWeek.needed - thisWeek.stars.length)
  const doneWeeks = past.filter((w) => w.complete).length

  if (!open) {
    return (
      <button
        type="button"
        className={styles.pill}
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-label={`이번 주 별 ${thisWeek.stars.length}개 — 별자리 펼치기`}
      >
        <span className={styles.pillPath}>
          <Constellation mondayKey={thisMonday} stars={thisWeek.stars} compact />
        </span>
        <span className={styles.pillText}>이번 주 {thisWeek.stars.length}별</span>
        <span className={styles.chevron} aria-hidden>
          ▾
        </span>
      </button>
    )
  }

  return (
    <section className={styles.open} aria-label="우리가 만든 별자리">
      <p className={styles.lead}>
        {thisWeek.complete
          ? `이번 주 ${shape.name} 완성`
          : thisWeek.stars.length === 0
            ? `일정을 체크하면 ${shape.name}에 별이 하나씩 떠요`
            : `${left}별 더 모으면 ${shape.name} 완성`}
      </p>

      <Constellation
        mondayKey={thisMonday}
        stars={thisWeek.stars}
        targetId={STAR_TARGET_ID}
        labelOf={(s) => `${s.dayKey.slice(5).replace('-', '.')} · ${titleOf(s.eventId) ?? '완료'}`}
      />
      {/* 왜 하필 이 별자리인지 — 지어낸 게 아니라 지금 하늘에 있는 것이다. */}
      <p className={styles.hint}>
        {shape.name} · {shape.hint}
      </p>

      {/* 누구 별인지 — 색만으로 말하지 않는다(§8). */}
      <ul className={styles.legend}>
        <li>
          <span className={`${styles.dot} ${styles.mine}`} aria-hidden /> 나
        </li>
        <li>
          <span className={`${styles.dot} ${styles.partner}`} aria-hidden /> 상대
        </li>
        <li>
          <span className={`${styles.dot} ${styles.shared}`} aria-hidden /> 함께
        </li>
      </ul>

      <h3 className={styles.gridTitle}>
        지난 주들 <span className={styles.count}>{doneWeeks}개 완성</span>
      </h3>
      <div className={styles.weeks}>
        {past.map((w) => (
          <WeekGlyph
            key={w.mondayKey}
            mondayKey={w.mondayKey}
            filled={w.stars.length}
            needed={w.needed}
            complete={w.complete}
          />
        ))}
      </div>

      <button type="button" className={styles.collapse} onClick={() => setOpen(false)} aria-expanded>
        접기 ▴
      </button>
    </section>
  )
}
