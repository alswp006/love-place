import { useMemo, useState } from 'react'
import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { EmptyState } from '@/components/common/EmptyState'
import { useAuth } from '@/state/auth'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import { tabByPath } from '@/app/tabs'
import {
  useGcalStatus,
  useGcalCalendars,
  useGcalEvents,
  useSetGcalCalendar,
  useDisconnectGcal,
  startGoogleCalendarConnect,
} from '@/hooks/useGoogleCalendar'
import { agendaRange, groupEventsByDay, formatDayLabel, formatEventTime } from '@/lib/gcal/datetime'
import type { GcalConnection } from '@/lib/gcal/types'
import styles from './CalendarPage.module.css'

// 📅 일정 — P2 공유 캘린더는 이후 확장. 1차로 구글 캘린더 읽기전용 오버레이(둘 다 보기).
export default function CalendarPage() {
  const tab = tabByPath('/calendar')
  const { user } = useAuth()
  const status = useGcalStatus()
  const [repick, setRepick] = useState(false)

  const conns = status.data ?? []
  const myConn = conns.find((c) => c.isMine) ?? null
  const anyPicked = conns.some((c) => c.googleCalendarId && c.isEnabled)
  const showPicker = Boolean(myConn && !myConn.googleCalendarId) || repick

  return (
    <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
      {status.isLoading ? (
        <CalendarSkeleton />
      ) : status.isError ? (
        <InlineError message="연결 상태를 불러오지 못했어요." onRetry={() => void status.refetch()} />
      ) : (
        <div className={styles.wrap}>
          <ConnectionChips conns={conns} meId={user?.id ?? null} />
          {showPicker ? (
            <CalendarPicker onPicked={() => setRepick(false)} />
          ) : anyPicked ? (
            <Agenda meId={user?.id ?? null} />
          ) : (
            <FirstRunConnect />
          )}
          {conns.length > 0 && <ManageFooter myConn={myConn} onRepick={() => setRepick(true)} />}
        </div>
      )}
    </ScreenScaffold>
  )
}

function ConnectionChips({ conns, meId }: { conns: GcalConnection[]; meId: string | null }) {
  const picked = conns.filter((c) => c.googleCalendarId && c.isEnabled)
  if (picked.length === 0) return null
  return (
    <ul className={styles.chips} aria-label="연결된 구글 캘린더">
      {picked.map((c) => (
        <li key={c.ownerId} className={styles.chip}>
          <span className={styles.dot} style={{ background: c.color }} aria-hidden />
          <span className={styles.chipName}>{c.calendarSummary ?? '구글 캘린더'}</span>
          <span className={styles.chipOwner}>· {c.ownerId === meId ? '나' : '상대'}</span>
        </li>
      ))}
    </ul>
  )
}

function Agenda({ meId }: { meId: string | null }) {
  const range = useMemo(() => agendaRange(new Date(), 4), [])
  const q = useGcalEvents(range)

  if (q.isLoading) return <CalendarSkeleton />
  if (q.isError) {
    return <InlineError message="일정을 불러오지 못했어요." onRetry={() => void q.refetch()} />
  }
  const events = q.data?.events ?? []
  if (events.length === 0) {
    return (
      <EmptyState
        emoji="📭"
        title="이번 4주간 표시할 일정이 없어요"
        hint="선택한 구글 캘린더에 일정이 생기면 여기에 자동으로 보여요."
      />
    )
  }
  const groups = groupEventsByDay(events)
  return (
    <div className={styles.agenda} aria-live="polite">
      {q.data?.degraded ? (
        <p className={styles.degraded} role="status">
          일부 캘린더를 불러오지 못했어요. 잠시 후 다시 시도돼요.
        </p>
      ) : null}
      {groups.map((g) => (
        <section key={g.dateKey} className={styles.day}>
          <h2 className={styles.dayLabel}>{formatDayLabel(g.dateKey)}</h2>
          <ul className={styles.events}>
            {g.events.map((ev) => {
              const ownerLabel = ev.ownerId === meId ? '나' : '상대'
              return (
                <li
                  key={ev.id}
                  className={styles.event}
                  aria-label={`${ownerLabel}의 구글 일정, ${formatEventTime(ev)} ${ev.title}`}
                >
                  <span className={styles.dot} style={{ background: ev.color }} aria-hidden />
                  <span className={styles.time}>{formatEventTime(ev)}</span>
                  <span className={styles.eventTitle}>{ev.title}</span>
                  <span className={styles.badge}>구글 · {ownerLabel}</span>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

function CalendarPicker({ onPicked }: { onPicked: () => void }) {
  const q = useGcalCalendars(true)
  const setCal = useSetGcalCalendar()

  if (q.isLoading) return <CalendarSkeleton />
  if (q.isError) {
    return <InlineError message="캘린더 목록을 불러오지 못했어요." onRetry={() => void q.refetch()} />
  }
  if (q.data && !q.data.connected) return <FirstRunConnect />
  const cals = q.data?.calendars ?? []
  if (cals.length === 0) {
    return (
      <EmptyState
        emoji="🗂️"
        title="선택할 캘린더가 없어요"
        hint="구글 캘린더에서 일정 카테고리를 먼저 만들어 주세요."
      />
    )
  }
  return (
    <div className={styles.picker}>
      <p className={styles.pickerTitle}>앱에 보여줄 구글 캘린더를 하나 선택하세요</p>
      <ul className={styles.calList}>
        {cals.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={styles.calBtn}
              disabled={setCal.isPending}
              onClick={() =>
                setCal.mutate(
                  {
                    googleCalendarId: c.id,
                    summary: c.summary,
                    color: c.backgroundColor ?? '#4285F4',
                  },
                  { onSuccess: () => onPicked() },
                )
              }
            >
              <span
                className={styles.dot}
                style={{ background: c.backgroundColor ?? '#4285F4' }}
                aria-hidden
              />
              <span className={styles.calName}>
                {c.summary}
                {c.primary ? ' · 기본' : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {setCal.isError ? (
        <p className={styles.err} role="alert">
          선택 저장에 실패했어요. 다시 시도해 주세요.
        </p>
      ) : null}
    </div>
  )
}

function FirstRunConnect() {
  const [busy, setBusy] = useState(false)
  return (
    <EmptyState
      emoji="📅"
      title="구글 캘린더를 우리 일정에 겹쳐 보세요"
      hint="내 구글 캘린더 하나를 골라 읽기 전용으로 표시해요. 연결하면 상대도 함께 볼 수 있어요."
      action={
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={busy || !isSupabaseConfigured}
          onClick={() => {
            setBusy(true)
            void startGoogleCalendarConnect()
          }}
        >
          {busy ? '구글로 이동 중…' : '구글 캘린더 연동'}
        </button>
      }
    />
  )
}

function ManageFooter({ myConn, onRepick }: { myConn: GcalConnection | null; onRepick: () => void }) {
  const disconnect = useDisconnectGcal()
  const [busy, setBusy] = useState(false)
  if (!myConn) {
    return (
      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.ghostBtn}
          disabled={busy || !isSupabaseConfigured}
          onClick={() => {
            setBusy(true)
            void startGoogleCalendarConnect()
          }}
        >
          {busy ? '이동 중…' : '내 구글 캘린더도 연동'}
        </button>
      </footer>
    )
  }
  return (
    <footer className={styles.footer}>
      <button type="button" className={styles.ghostBtn} onClick={onRepick}>
        다른 캘린더 선택
      </button>
      <button
        type="button"
        className={styles.dangerBtn}
        disabled={disconnect.isPending}
        onClick={() => disconnect.mutate()}
      >
        {disconnect.isPending ? '해제 중…' : '구글 연결 해제'}
      </button>
    </footer>
  )
}

function CalendarSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden>
      <div className={styles.skelRow} />
      <div className={styles.skelRow} />
      <div className={styles.skelRow} />
    </div>
  )
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className={styles.inlineError} role="alert">
      <p>{message}</p>
      <button type="button" className={styles.ghostBtn} onClick={onRetry}>
        다시 시도
      </button>
    </div>
  )
}
