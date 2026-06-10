import { useMemo, useState } from 'react'
import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { EmptyState } from '@/components/common/EmptyState'
import { ConflictBanner } from '@/components/common/ConflictBanner'
import { SourceAvatar } from '@/components/common/SourceAvatar'
import { EventSheet } from '@/components/calendar/EventSheet'
import { useAuth } from '@/state/auth'
import { useCouple } from '@/hooks/useCouple'
import { useProfiles, type ProfileMap } from '@/hooks/useProfiles'
import { useEvents, type EventRow } from '@/hooks/useEvents'
import { useEventMutations, type NewEvent, type EventPatch } from '@/hooks/useEventMutations'
import { useConflict } from '@/lib/sync/useConflict'
import { deriveTrack, TRACK_META, ALL_TRACKS, type Track } from '@/lib/calendar/track'
import { dayKey, monthMatrix, addMonths, groupByDay, formatTime, type DayCell } from '@/lib/calendar/eventDays'
import { expandEvents, type Occurrence } from '@/lib/calendar/rrule'
import { tabByPath } from '@/app/tabs'
import styles from './CalendarPage.module.css'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 📅 일정 — 3트랙 공유 캘린더(§5.1). 월 그리드 + 선택일 아젠다 + 트랙 칩 + 생성/수정 시트.
// (주/일 뷰·RRULE 반복·사용자별 리마인더·활동피드는 후속 패킷.)
export default function CalendarPage() {
  const tab = tabByPath('/calendar')
  const { user } = useAuth()
  const myId = user?.id ?? null
  const { data: couple, isLoading: coupleLoading } = useCouple()
  const coupleId = couple?.coupleId ?? null
  const { data: events } = useEvents(coupleId)
  const { data: profiles } = useProfiles(coupleId)
  const conflict = useConflict()
  const { create, update, remove } = useEventMutations(coupleId, myId, conflict.flag)

  const todayKey = dayKey(new Date().toISOString())
  const [view, setView] = useState(() => {
    const parts = todayKey.split('-')
    return { year: Number(parts[0]), month0: Number(parts[1]) - 1 }
  })
  const [selected, setSelected] = useState(todayKey)
  const [filter, setFilter] = useState<Set<Track>>(() => new Set(ALL_TRACKS))
  const [sheet, setSheet] = useState<{ open: boolean; editing: EventRow | null }>({ open: false, editing: null })

  const visibleEvents = useMemo(
    () => (events ?? []).filter((e) => filter.has(deriveTrack(e, myId))),
    [events, filter, myId],
  )
  const cells = useMemo(() => monthMatrix(view.year, view.month0), [view])
  // 반복 일정을 보이는 달 윈도우로 회차 전개(비반복은 그대로). 편집은 시리즈 기준(_seriesStart).
  const expanded = useMemo(() => {
    const first = cells[0]?.key
    const last = cells[cells.length - 1]?.key
    if (!first || !last) return []
    const winStart = new Date(`${first}T00:00:00+09:00`).toISOString()
    const winEnd = new Date(`${last}T23:59:59+09:00`).toISOString()
    return expandEvents(visibleEvents, winStart, winEnd)
  }, [visibleEvents, cells])
  const grouped = useMemo(() => groupByDay(expanded), [expanded])
  const dayEvents = grouped[selected] ?? []

  if (!coupleLoading && couple?.status !== 'ACTIVE') {
    return (
      <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
        <EmptyState
          emoji="💑"
          title="먼저 상대와 연결해요"
          hint="'우리' 탭에서 초대 코드로 연결하면, 둘이 함께 일정을 겹쳐 봐요."
        />
      </ScreenScaffold>
    )
  }

  const toggleTrack = (t: Track) =>
    setFilter((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })

  const busy = create.isPending || update.isPending || remove.isPending
  const closeSheet = () => setSheet({ open: false, editing: null })
  const onCreate = (e: NewEvent) => create.mutate(e, { onSuccess: closeSheet })
  const onUpdate = (id: string, v: number, patch: EventPatch) =>
    update.mutate({ id, expectedVersion: v, patch }, { onSuccess: closeSheet })
  const onDelete = (id: string, v: number) =>
    remove.mutate({ id, expectedVersion: v }, { onSuccess: closeSheet })

  return (
    <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
      <div className={styles.container}>
        {conflict.conflict ? <ConflictBanner onDismiss={conflict.clear} /> : null}

        <div className={styles.monthNav}>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => setView(addMonths(view.year, view.month0, -1))}
            aria-label="이전 달"
          >
            ‹
          </button>
          <span className={styles.monthLabel} aria-live="polite">
            {view.year}년 {view.month0 + 1}월
          </span>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => setView(addMonths(view.year, view.month0, 1))}
            aria-label="다음 달"
          >
            ›
          </button>
        </div>

        <TrackChips filter={filter} onToggle={toggleTrack} />

        <MonthGrid
          cells={cells}
          grouped={grouped}
          selected={selected}
          todayKey={todayKey}
          myId={myId}
          onSelect={setSelected}
        />

        <DayAgenda
          dateKey={selected}
          events={dayEvents}
          myId={myId}
          profiles={profiles ?? {}}
          onEdit={(ev) => setSheet({ open: true, editing: { ...ev, start: ev._seriesStart, end: ev._seriesEnd } })}
        />

        <button
          type="button"
          className={styles.fab}
          onClick={() => setSheet({ open: true, editing: null })}
          aria-label="일정 추가"
        >
          ＋
        </button>
      </div>

      {sheet.open ? (
        <EventSheet
          initial={sheet.editing}
          defaultDate={selected}
          myId={myId}
          busy={busy}
          onClose={closeSheet}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ) : null}
    </ScreenScaffold>
  )
}

// 트랙 칩 — 색 + 심볼 + 라벨 이중화(§8). aria-pressed로 토글 상태.
function TrackChips({ filter, onToggle }: { filter: Set<Track>; onToggle: (t: Track) => void }) {
  return (
    <div className={styles.chips} role="group" aria-label="트랙 필터">
      {ALL_TRACKS.map((t) => {
        const meta = TRACK_META[t]
        const on = filter.has(t)
        return (
          <button
            key={t}
            type="button"
            className={`${styles.chip} ${on ? styles.chipOn : ''}`}
            style={on ? { borderColor: meta.cssVar, color: meta.cssVar } : undefined}
            aria-pressed={on}
            onClick={() => onToggle(t)}
          >
            <span aria-hidden>{meta.symbol}</span> {meta.label}
          </button>
        )
      })}
    </div>
  )
}

function MonthGrid({
  cells,
  grouped,
  selected,
  todayKey,
  myId,
  onSelect,
}: {
  cells: DayCell[]
  grouped: Record<string, EventRow[]>
  selected: string
  todayKey: string
  myId: string | null
  onSelect: (key: string) => void
}) {
  return (
    <div className={styles.grid}>
      {WEEKDAYS.map((w) => (
        <div key={w} className={styles.weekday} aria-hidden>
          {w}
        </div>
      ))}
      {cells.map((c) => {
        const evs = grouped[c.key] ?? []
        const tracks = Array.from(new Set(evs.map((e) => deriveTrack(e, myId))))
        const classes = [
          styles.cell,
          c.inMonth ? '' : styles.cellOut,
          c.key === selected ? styles.cellSel : '',
          c.key === todayKey ? styles.cellToday : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <button
            key={c.key}
            type="button"
            className={classes}
            onClick={() => onSelect(c.key)}
            aria-pressed={c.key === selected}
            aria-label={`${c.key}${evs.length ? ` · ${tracks.map((t) => TRACK_META[t].label).join('·')} 일정 ${evs.length}개` : ''}`}
          >
            <span className={styles.cellDay}>{c.day}</span>
            <span className={styles.dots}>
              {/* 색만 아니라 트랙 심볼(●▲■)로 이중화(§8 색각 이상 대응) */}
              {tracks.map((t) => (
                <span key={t} className={styles.dot} style={{ color: TRACK_META[t].cssVar }} aria-hidden>
                  {TRACK_META[t].symbol}
                </span>
              ))}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function DayAgenda({
  dateKey,
  events,
  myId,
  profiles,
  onEdit,
}: {
  dateKey: string
  events: Occurrence<EventRow>[]
  myId: string | null
  profiles: ProfileMap
  onEdit: (ev: Occurrence<EventRow>) => void
}) {
  return (
    <section className={styles.agenda} aria-label={`${dateKey} 일정`}>
      <h2 className={styles.agendaTitle}>{dateKey}</h2>
      {events.length === 0 ? (
        <p className={styles.agendaEmpty}>이 날 일정이 없어요. ＋ 로 추가해보세요.</p>
      ) : (
        <ul className={styles.eventList}>
          {events.map((ev) => {
            const t = deriveTrack(ev, myId)
            const meta = TRACK_META[t]
            return (
              <li key={ev.id}>
                <button type="button" className={styles.eventItem} onClick={() => onEdit(ev)}>
                  <span className={styles.eventBar} style={{ background: meta.cssVar }} aria-hidden />
                  <span className={styles.eventTime}>{ev.is_all_day ? '종일' : formatTime(ev.start)}</span>
                  <span className={styles.eventTitle}>{ev.title}</span>
                  {ev.recurrence_rule ? <span aria-label="반복 일정">🔁</span> : null}
                  {myId && ev.reminders?.some((r) => r.userId === myId) ? (
                    <span aria-label="리마인더 설정됨">🔔</span>
                  ) : null}
                  <SourceAvatar userId={ev.owner_id} profiles={profiles} myId={myId} context=" 일정" />
                  <span className={styles.eventTrack} style={{ color: meta.cssVar }}>
                    {meta.symbol} {meta.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
