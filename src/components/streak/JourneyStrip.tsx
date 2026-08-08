import { useMemo, useState } from 'react'
import { useAuth } from '@/state/auth'
import { useCouple } from '@/hooks/useCouple'
import { useEvents } from '@/hooks/useEvents'
import { useProfiles } from '@/hooks/useProfiles'
import { useEventCompletions } from '@/hooks/useEventCompletions'
import {
  dailyDoneCounts,
  gardenGrid,
  journeyProgress,
  weekDoneCount,
  levelOf,
  ownerOf,
  type EventMeta,
} from '@/lib/streak/garden'
import { localDayKey } from '@/lib/journey/autoLink'
import { JourneyPath } from './JourneyPath'
import styles from './JourneyStrip.module.css'

// 일정 탭 맨 위의 여정/잔디 — 기본은 한 줄, 탭하면 펼쳐진다.
//
// 접어 두는 이유는 지도 알림과 같다: 이 탭의 주인공은 캘린더다. 여정은 "오늘 뭘 할까"를
// 밀어내지 않는 선에서 곁에 있어야 한다.
//
// categoryId를 받으면 그 분류의 잔디만 센다 — 캘린더의 카테고리 칩과 같은 축으로 움직인다.
// (undefined = 전체. null = '분류 없음'이라는 하나의 칸.)

const DOW = ['월', '화', '수', '목', '금', '토', '일']

export function JourneyStrip({ categoryId }: { categoryId?: string | null }) {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  const { data: couple } = useCouple()
  const coupleId = couple?.coupleId ?? null
  const myId = user?.id ?? null

  const { data: events } = useEvents(coupleId)
  const { data: completions } = useEventCompletions(coupleId)
  const { data: profiles } = useProfiles(coupleId)

  const today = localDayKey()

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

  const steps = useMemo(() => {
    let n = 0
    for (const c of counts.values()) n += c.total
    return n
  }, [counts])

  const progress = journeyProgress(steps)
  const week = weekDoneCount(counts, today)
  const grid = useMemo(() => gardenGrid(counts, today), [counts, today])

  const mineColor =
    (myId ? profiles?.[myId]?.color : null) ?? 'var(--c-track-mine)'
  const partnerId = Object.keys(profiles ?? {}).find((id) => id !== myId)
  const partnerColor =
    (partnerId ? profiles?.[partnerId]?.color : null) ?? 'var(--c-track-partner)'

  if (!open) {
    return (
      <button
        type="button"
        className={styles.pill}
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-label={`이번 주 ${week}칸 완료, 다음 정거장까지 ${progress.remaining}걸음 — 잔디 펼치기`}
      >
        <span className={styles.pillPath}>
          <JourneyPath
            progress={progress}
            mineColor={mineColor}
            partnerColor={partnerColor}
            compact
          />
        </span>
        <span className={styles.pillText}>이번 주 {week}칸</span>
        <span className={styles.chevron} aria-hidden>
          ▾
        </span>
      </button>
    )
  }

  return (
    <section className={styles.open} aria-label="우리의 여정">
      <p className={styles.lead}>
        {progress.steps === 0
          ? '일정을 체크하면 한 걸음씩 나아가요'
          : `${progress.to.label}까지 ${progress.remaining}걸음`}
      </p>

      <JourneyPath progress={progress} mineColor={mineColor} partnerColor={partnerColor} />

      <h3 className={styles.gridTitle}>12주 기록</h3>
      <div className={styles.gridWrap}>
        <ul className={styles.dow} aria-hidden>
          {DOW.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        <div
          className={styles.grid}
          role="img"
          aria-label={`최근 12주 완료 기록 — 이번 주 ${week}칸, 통틀어 ${steps}칸`}
        >
          {grid.map((col) => (
            <div key={col[0]!.key} className={styles.col}>
              {col.map((cell) => {
                const lv = levelOf(cell.total)
                const who = ownerOf(cell)
                return (
                  <span
                    key={cell.key}
                    className={`${styles.cell} ${styles[`lv${lv}`]} ${styles[who]}`}
                    title={`${cell.key} · ${cell.total}칸`}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 색만으로 읽히지 않게 범례를 글자로 함께 둔다(§8). */}
      <ul className={styles.legend}>
        <li>
          <span className={`${styles.cell} ${styles.lv0}`} aria-hidden /> 없음
        </li>
        <li>
          <span className={`${styles.cell} ${styles.lv1} ${styles.mine}`} aria-hidden /> 나
        </li>
        <li>
          <span className={`${styles.cell} ${styles.lv2} ${styles.partner}`} aria-hidden /> 상대
        </li>
        <li>
          <span className={`${styles.cell} ${styles.lv3} ${styles.shared}`} aria-hidden /> 함께
        </li>
      </ul>

      <button type="button" className={styles.collapse} onClick={() => setOpen(false)} aria-expanded>
        접기 ▴
      </button>
    </section>
  )
}
