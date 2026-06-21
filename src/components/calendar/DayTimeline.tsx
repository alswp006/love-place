import type { EventRow } from '@/hooks/useEvents'
import type { Occurrence } from '@/lib/calendar/rrule'
import { minuteOfDay, formatTime } from '@/lib/calendar/eventDays'
import { deriveTrack, TRACK_META } from '@/lib/calendar/track'
import styles from '@/pages/CalendarPage.module.css'

// Task 12(R2.3): Day 타임라인 — flat agenda 대신 시간축 절대배치(조사 04 §4).
// 종일 이벤트는 상단 종일 밴드(all-day lane), 시간 이벤트는 minuteOfDay(Task 3)로 세로 위치.
// 색 단독 금지(§8) → 트랙 심볼(●/▲/■) + 라벨 동반. 키는 composite(`${id}:${start}`)로 반복 occurrence 충돌 방지.
// Task 16(R4.4): 트랙이 색+심볼로만 전달되어 SR 미고지였음 → 각 이벤트 버튼에 트랙명 포함 aria-label로 고지.
//   비액션 심볼 span(●/▲/■)은 aria-hidden 유지 — 마커 비액션 글리프(places/selectedMarker.ts: 글리프 div가 aria-hidden,
//   히트영역이 aria-label)와 동일한 "비액션 글리프=aria-hidden, 식별=상위 라벨" 패턴으로 일관.

const MIN_PER_DAY = 1440
const HOURS = Array.from({ length: 24 }, (_, h) => h)

export function DayTimeline({
  dateKey,
  occurrences,
  myId,
  onEdit,
  onAdd,
}: {
  dateKey: string
  occurrences: Occurrence<EventRow>[]
  myId: string | null
  onEdit: (ev: Occurrence<EventRow>) => void
  onAdd: () => void
}) {
  const allDay = occurrences.filter((e) => e.is_all_day)
  const timed = occurrences.filter((e) => !e.is_all_day)
  const isEmpty = occurrences.length === 0

  return (
    <section className={styles.timeline} aria-label={`${dateKey} 타임라인`}>
      {/* 종일 밴드 — 시간축 위 별도 lane. 종일 이벤트만(시간 절대배치 아님). */}
      <div className={styles.allDayLane} aria-label="종일 일정">
        {allDay.length === 0 ? (
          <span className={styles.allDayEmpty}>종일 일정 없음</span>
        ) : (
          allDay.map((ev) => {
            const meta = TRACK_META[deriveTrack(ev, myId)]
            return (
              <button
                key={`${ev.id}:${ev.start}`}
                type="button"
                data-occ
                className={styles.allDayItem}
                style={{ borderColor: meta.cssVar }}
                onClick={() => onEdit(ev)}
                aria-label={`${meta.label} 일정 · ${ev.title}`}
              >
                <span aria-hidden style={{ color: meta.cssVar }}>
                  {meta.symbol}
                </span>{' '}
                <span className={styles.timelineTitle}>{ev.title}</span>
                {ev.recurrence_rule ? <span aria-label="반복 일정">🔁</span> : null}
              </button>
            )
          })
        )}
      </div>

      {/* 시간축 — 24시간 hour rows + 절대배치 이벤트 블록. */}
      <div className={styles.timeGrid}>
        <div className={styles.hourCol} aria-hidden>
          {HOURS.map((h) => (
            <div key={h} className={styles.hourRow}>
              <span className={styles.hourLabel}>{h.toString().padStart(2, '0')}:00</span>
            </div>
          ))}
        </div>
        <div className={styles.eventCol}>
          {timed.map((ev) => {
            const meta = TRACK_META[deriveTrack(ev, myId)]
            const startMin = minuteOfDay(ev.start)
            // 자정 넘김(end < start day)은 당일 끝까지 클램프. 최소 1.5%(가독성).
            let endMin = minuteOfDay(ev.end)
            if (endMin <= startMin) endMin = MIN_PER_DAY
            const top = (startMin / MIN_PER_DAY) * 100
            const height = Math.max(((endMin - startMin) / MIN_PER_DAY) * 100, 1.5)
            const time = formatTime(ev.start)
            return (
              <button
                key={`${ev.id}:${ev.start}`}
                type="button"
                data-occ
                className={styles.timelineItem}
                style={{
                  top: `${top}%`,
                  height: `${height}%`,
                  borderLeftColor: meta.cssVar,
                }}
                onClick={() => onEdit(ev)}
                aria-label={`${meta.label} 일정 · ${ev.title} ${time}`}
              >
                <span className={styles.timelineTime}>{time}</span>{' '}
                <span className={styles.timelineTitle}>{ev.title}</span>{' '}
                <span aria-hidden style={{ color: meta.cssVar }}>
                  {meta.symbol}
                </span>
                {ev.recurrence_rule ? <span aria-label="반복 일정">🔁</span> : null}
                {myId && ev.reminders?.some((r) => r.userId === myId) ? (
                  <span aria-label="리마인더 설정됨">🔔</span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      {isEmpty ? (
        <p className={styles.timelineEmpty}>
          이 날 일정이 없어요.{' '}
          <button type="button" className={styles.timelineAdd} onClick={onAdd} aria-label="일정 추가">
            ＋
          </button>
        </p>
      ) : null}
    </section>
  )
}
