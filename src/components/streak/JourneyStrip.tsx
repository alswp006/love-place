import { useMemo, useState } from 'react'
import { useAuth } from '@/state/auth'
import { useCouple } from '@/hooks/useCouple'
import { useEvents } from '@/hooks/useEvents'
import { useEventCompletions } from '@/hooks/useEventCompletions'
import {
  dailyDoneCounts,
  monthsOfYear,
  monthOf,
  type EventMeta,
} from '@/lib/streak/garden'
import { constellationOfMonth } from '@/lib/streak/constellations'
import { localDayKey } from '@/lib/journey/autoLink'
import { Constellation, MonthGlyph } from './Constellation'
import { STAR_TARGET_ID } from './flyStar'
import styles from './JourneyStrip.module.css'

// 일정 탭 맨 위 — 이번 주 별자리. 기본은 한 줄, 탭하면 펼쳐진다.
//
// 접어 두는 이유는 지도 알림과 같다: 이 탭의 주인공은 캘린더다.
//
// 별자리 = 황도 12궁. 달마다 하나씩 1:1로 붙어서 열두 달을 채우면 황도 한 바퀴가 완성된다.
// (앞서 쓰던 '카페→해변' 여정은 우리 데이터와 무관한 가짜 서사였고, '그 달에 보이는 별자리'는
//  12개월에 1:1로 안 떨어져 열두 칸에 같은 모양이 겹쳤다.)
//
// categoryId를 받으면 그 분류만 센다 — 캘린더의 카테고리 칩과 같은 축으로 움직인다.
// (undefined = 전체. null = '분류 없음'이라는 하나의 칸.)

export function JourneyStrip({ categoryId }: { categoryId?: string | null }) {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  const { data: couple } = useCouple()
  const coupleId = couple?.coupleId ?? null
  // 혼자면 분모가 날 수 × 1이다 — 2로 두면 다 채워도 절반이라 영원히 완성되지 않는다(0024).
  const members: 1 | 2 = couple?.isSolo ? 1 : 2
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

  // 올해 1~12월을 전부 보여준다 — 지나온 달만 두면 "앞으로 몇 개 남았나"가 안 보인다.
  const months = useMemo(() => monthsOfYear(counts, today, members), [counts, today, members])
  const monthKey = monthOf(today)
  const thisMonth = months.find((m) => m.monthKey === monthKey) ?? months[0]!
  const shape = constellationOfMonth(monthKey)
  const left = Math.max(0, thisMonth.needed - thisMonth.stars.length)

  if (!open) {
    return (
      <button
        type="button"
        className={styles.pill}
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-label={`이번 달 별 ${thisMonth.stars.length}/${thisMonth.needed}개 — 별자리 펼치기`}
      >
        <span className={styles.pillPath}>
          <Constellation monthKey={monthKey} stars={thisMonth.stars} members={members} compact />
        </span>
        <span className={styles.pillText}>
          {thisMonth.stars.length}/{thisMonth.needed}
        </span>
        <span className={styles.chevron} aria-hidden>
          ▾
        </span>
      </button>
    )
  }

  return (
    <section className={styles.open} aria-label="우리가 만든 별자리">
      {/* 접기는 우상단 — 하단에 두면 카드가 그만큼 길어지고, 펼친 뒤 가장 먼저 찾는 게 이 버튼이다. */}
      <button
        type="button"
        className={styles.collapse}
        onClick={() => setOpen(false)}
        aria-expanded
        aria-label="별자리 접기"
      >
        ▴
      </button>

      <p className={styles.lead}>
        {thisMonth.complete
          ? `이번 달 ${shape.name} 완성`
          : `${shape.name} · ${thisMonth.stars.length}/${thisMonth.needed} · ${left}개 남음`}
      </p>

      <Constellation
        monthKey={monthKey}
        stars={thisMonth.stars}
        members={members}
        targetId={STAR_TARGET_ID}
        labelOf={(s) => `${s.dayKey.slice(5).replace('-', '.')} · ${titleOf(s.eventId) ?? '완료'}`}
      />
      {/* 설명(왜 이 별자리인지)과 범례(누구 별인지)를 한 줄에 — 각자 한 줄씩 쓰면 하늘이 밀린다.
          색만으로 말하지 않는다(§8). '함께'는 없다: 별은 체크한 사람 것이다.
          혼자면 범례를 통째로 뺀다 — 별이 전부 내 것이라 구분할 게 없고,
          '상대' 점은 영원히 안 채워지는 빈 약속이 된다(0024). */}
      <div className={styles.meta}>
        <span className={styles.hint}>{shape.hint}</span>
        {members === 2 ? (
          <ul className={styles.legend}>
            <li>
              <span className={`${styles.dot} ${styles.mine}`} aria-hidden /> 나
            </li>
            <li>
              <span className={`${styles.dot} ${styles.partner}`} aria-hidden /> 상대
            </li>
          </ul>
        ) : null}
      </div>

      {/* 올해 열두 달 — 각 달의 별자리를 줄여 보여준다. 이번 달은 테두리로, 아직 안 온 달은 흐리게. */}
      <div className={styles.months} aria-label="올해 열두 달">
        {months.map((m) => (
          <MonthGlyph
            key={m.monthKey}
            monthKey={m.monthKey}
            filled={m.stars.length}
            needed={m.needed}
            complete={m.complete}
            current={m.monthKey === monthKey}
            future={m.monthKey > monthKey}
          />
        ))}
      </div>

    </section>
  )
}
