import { weekMatrix, diffDays, ymdKey, type DayCell } from '@/lib/calendar/eventDays'
import styles from '@/pages/CalendarPage.module.css'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

// Task 12(R2.3): 주 네비 스트립 — weekMatrix(selected) 7일 칩 + 좌우 주 이동(diffDays).
// 주 뷰가 비대해지므로 일 뷰만 출하하고 주는 strip 네비로(tractable 범위). 칩 탭 = 그 날 선택.
export function WeekStrip({
  selected,
  todayKey,
  hasEventsByKey,
  onSelect,
}: {
  selected: string
  todayKey: string
  hasEventsByKey: (key: string) => boolean
  onSelect: (key: string) => void
}) {
  const cells: DayCell[] = weekMatrix(selected)
  const shiftWeek = (deltaDays: number) => {
    const [y, m, d] = selected.split('-').map(Number)
    const cur = new Date(Date.UTC(y!, (m ?? 1) - 1, d!))
    cur.setUTCDate(cur.getUTCDate() + deltaDays)
    onSelect(ymdKey(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate()))
  }

  return (
    <div className={styles.weekStrip}>
      <button type="button" className={styles.navBtn} onClick={() => shiftWeek(-7)} aria-label="이전 주">
        ‹
      </button>
      <div className={styles.weekStripDays} role="group" aria-label="주 날짜 선택">
        {cells.map((c) => {
          const dowIdx = ((diffDays(todayKey, c.key) % 7) + 7) % 7
          const sel = c.key === selected
          const today = c.key === todayKey
          const classes = [
            styles.weekChip,
            sel ? styles.weekChipSel : '',
            today ? styles.weekChipToday : '',
          ]
            .filter(Boolean)
            .join(' ')
          // DOW 라벨은 셀 인덱스(weekMatrix는 일요일 시작)로 직접 매핑(0=일).
          const labelIdx = cells.indexOf(c)
          return (
            <button
              key={c.key}
              type="button"
              className={classes}
              aria-pressed={sel}
              aria-label={`${c.key}${hasEventsByKey(c.key) ? ' · 일정 있음' : ''}`}
              onClick={() => onSelect(c.key)}
              data-dow={dowIdx}
            >
              <span className={styles.weekChipDow} aria-hidden>
                {DOW[labelIdx]}
              </span>
              <span className={styles.weekChipNum}>{c.day}</span>
              {hasEventsByKey(c.key) ? <span className={styles.weekChipDot} aria-hidden /> : null}
            </button>
          )
        })}
      </div>
      <button type="button" className={styles.navBtn} onClick={() => shiftWeek(7)} aria-label="다음 주">
        ›
      </button>
    </div>
  )
}
