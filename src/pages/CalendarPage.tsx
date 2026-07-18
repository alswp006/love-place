import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ScreenScaffold } from '@/components/common/ScreenScaffold'
import { EmptyState } from '@/components/common/EmptyState'
import { Skeleton } from '@/components/common/Skeleton'
import { ConflictBanner } from '@/components/common/ConflictBanner'
import { SourceAvatar } from '@/components/common/SourceAvatar'
import { EventSheet } from '@/components/calendar/EventSheet'
import { ScopeSheet, type Scope } from '@/components/calendar/ScopeSheet'
import { DayTimeline } from '@/components/calendar/DayTimeline'
import { WeekStrip } from '@/components/calendar/WeekStrip'
import { TrackLegend } from '@/components/calendar/TrackLegend'
import { useAuth } from '@/state/auth'
import { useCouple } from '@/hooks/useCouple'
import { useProfiles, type ProfileMap } from '@/hooks/useProfiles'
import { useEvents, type EventRow } from '@/hooks/useEvents'
import { usePlaces, type PlaceRow } from '@/hooks/usePlaces'
import { useEventMutations, type NewEvent, type EventPatch } from '@/hooks/useEventMutations'
import { useSoftDeleteWithUndo } from '@/hooks/useTrash'
import { useToast } from '@/hooks/useToast'
import { useConflict } from '@/lib/sync/useConflict'
import { refetchEventRow, ConflictError } from '@/lib/sync/versionedUpdate'
import { deriveTrack, TRACK_META, ALL_TRACKS, type Track } from '@/lib/calendar/track'
import { dayKey, monthMatrix, addMonths, groupByDay, formatTime, type DayCell } from '@/lib/calendar/eventDays'
import { expandEvents, buildRule, parseRule, type Occurrence } from '@/lib/calendar/rrule'
import { exdateOccurrence, splitFollowing, shiftTimesToOccurrence } from '@/lib/calendar/recurrenceScope'
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
  const { data: events, isLoading: eventsLoading } = useEvents(coupleId)
  const { data: profiles } = useProfiles(coupleId)
  // 저장된 장소 목록 — Task 13: 아젠다 장소 칩(place_id→이름·지도 링크)에 id로 인덱싱해 쓴다.
  // (일정 폼은 '일정만' 관리 — 장소 연결 피커 제거. place_id는 추천 코스→일정·아젠다 칩에서만.)
  const { data: places } = usePlaces(coupleId)
  const conflict = useConflict()
  // 권한거부(상대 PERSONAL 수정 시도) — 버전충돌과 분리해 별도 배너로 안내(Task 7). 시트는 유지.
  const permission = useConflict()
  const { create, update } = useEventMutations(coupleId, myId, conflict.flag, permission.flag)
  // 일정 삭제 Undo는 공용 헬퍼로 통합(Task 18) — 방문·여행과 단일 구현(이전 useRestoreEvent 인라인 중복 제거).
  const { deleteWithUndo, isPending: deletePending } = useSoftDeleteWithUndo('events', coupleId, myId, conflict.flag)
  const toast = useToast()
  // 충돌 후 시트로 내려보낼 최신 서버 행(version 재시드 + 메모 append-merge용, §4.3).
  const [conflictRefresh, setConflictRefresh] = useState<{ version: number; memo: string | null } | null>(null)

  const todayKey = dayKey(new Date().toISOString())
  // ?date=YYYY-MM-DD 딥링크(R1.1) — 코스 추가 후 그 날로 점프. 형식 검증 후 시드, 아니면 오늘.
  const [searchParams, setSearchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  const initialKey = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayKey
  // ?view=month|week|day 딥링크(Task 12) — 뷰 전환 상태를 URL과 동기화(뒤로가기/공유 가능).
  const viewParam = searchParams.get('view')
  const initialMode: 'month' | 'week' | 'day' =
    viewParam === 'week' || viewParam === 'day' ? viewParam : 'month'

  // view(월 그리드)·selected(선택일) 둘 다 initialKey로 시드 — 다른 달 딥링크 시 엉뚱한 달 착지 방지.
  const [view, setView] = useState(() => {
    const parts = initialKey.split('-')
    return { year: Number(parts[0]), month0: Number(parts[1]) - 1 }
  })
  const [selected, setSelected] = useState(initialKey)
  // 마운트 후 딥링크가 바뀌면(예: RecommendPage에서 추가 후 navigate) 선택일/뷰를 재시드.
  useEffect(() => {
    if (!(dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam))) return
    setSelected(dateParam)
    const parts = dateParam.split('-')
    setView({ year: Number(parts[0]), month0: Number(parts[1]) - 1 })
  }, [dateParam])
  // 주/일 뷰에서 WeekStrip 주 이동·점프로 selected가 보이는 달 윈도우 밖으로 나가면 전개 윈도우가
  // 그 날을 안 덮어 일정이 비어 보인다 → selected의 달로 view를 맞춰 전개 윈도우가 항상 포함하게.
  useEffect(() => {
    const parts = selected.split('-')
    const y = Number(parts[0])
    const m0 = Number(parts[1]) - 1
    setView((prev) => (prev.year === y && prev.month0 === m0 ? prev : { year: y, month0: m0 }))
  }, [selected])
  // 뷰 모드(월/주/일). ?view= 와 양방향 동기화 — setMode가 URL을 갱신(딥링크/뒤로가기).
  const [mode, setMode] = useState<'month' | 'week' | 'day'>(initialMode)
  useEffect(() => {
    if (viewParam === 'week' || viewParam === 'day') setMode(viewParam)
    else setMode('month')
  }, [viewParam])
  const changeMode = (next: 'month' | 'week' | 'day') => {
    setMode(next)
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev)
        if (next === 'month') sp.delete('view')
        else sp.set('view', next)
        return sp
      },
      { replace: true },
    )
  }
  const [filter, setFilter] = useState<Set<Track>>(() => new Set(ALL_TRACKS))
  // 편집 시트는 시리즈 행(editing)을 보여주되, 클릭한 occurrence의 시작 ISO/dayKey도 함께 보존한다
  // (조사 01 §3 — 현재는 시리즈로 덮어써 occurrence가 소실 → 범위 분기에 occurrence 시각이 필요).
  const [sheet, setSheet] = useState<{
    open: boolean
    editing: EventRow | null
    occStartIso: string | null
    occDayKey: string | null
  }>({ open: false, editing: null, occStartIso: null, occDayKey: null })
  // 반복 occurrence 편집/삭제 시 범위 선택 시트(이 일정만/이후/전체). pending에 분기 컨텍스트 보존.
  const [scope, setScope] = useState<{ mode: 'edit' | 'delete'; series: EventRow; occStartIso: string; occDayKey: string; patch: EventPatch | null } | null>(null)

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
  // 아젠다 장소 칩용 id→장소 인덱스(Task 13). place_id가 가리키는 장소 이름·지도 링크를 O(1) 조회.
  const placeById = useMemo(() => {
    const map: Record<string, PlaceRow> = {}
    for (const p of places ?? []) map[p.id] = p
    return map
  }, [places])

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

  // 연결됨이지만 일정 로딩 중 → 죽은 빈 캘린더 대신 스켈레톤(§7). 그리드 모양 placeholder.
  if (eventsLoading) {
    return (
      <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
        <Skeleton count={6} label="일정 불러오는 중" />
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

  const busy = create.isPending || update.isPending || deletePending
  // occurrence 클릭 → 편집 시트. 폼은 시리즈 기준(start/end를 _seriesStart/End로 복원)이되,
  // 범위 분기를 위해 클릭한 occurrence의 시작 ISO/dayKey를 별도 보존(DayAgenda·DayTimeline 공통).
  const openEdit = (ev: Occurrence<EventRow>) =>
    setSheet({
      open: true,
      editing: { ...ev, start: ev._seriesStart, end: ev._seriesEnd },
      occStartIso: ev.start,
      occDayKey: dayKey(ev.start),
    })
  const openCreate = () => setSheet({ open: true, editing: null, occStartIso: null, occDayKey: null })
  const closeSheet = () => {
    setSheet({ open: false, editing: null, occStartIso: null, occDayKey: null })
    setConflictRefresh(null)
  }
  const onCreate = (e: NewEvent) => create.mutate(e, { onSuccess: closeSheet })

  // 버전충돌이면 시트 유지 + 최신 서버 행을 시트로 내려 version 재시드·메모 머지(§4.3).
  // 권한거부는 시트 유지(배너로 안내) — onError에서 콜백이 갈리므로 여기선 충돌만 재시드한다.
  const plainUpdate = (id: string, v: number, patch: EventPatch) =>
    update.mutate(
      { id, expectedVersion: v, patch },
      {
        onSuccess: closeSheet,
        onError: (err) => {
          if (err instanceof ConflictError) {
            void refetchEventRow(id).then((fresh) => {
              if (fresh) setConflictRefresh({ version: fresh.version, memo: fresh.memo })
            })
          }
        },
      },
    )
  // 삭제 → 시트 닫고 공용 헬퍼가 '일정을 삭제했어요' + 되돌리기 Undo 토스트(삭제로 +1된 버전 v+1로 복구, §4.3).
  // 충돌은 헬퍼가 onConflict(conflict.flag)로 처리(토스트 없음). 단일 토스트만 발화(중복 제거).
  const plainDelete = (id: string, v: number) => {
    closeSheet()
    void deleteWithUndo({ id, expectedVersion: v })
  }

  // 목록에서 바로 삭제(상세 진입 불필요) — 비반복은 Undo 토스트 소프트삭제, 반복은 범위 시트로 분기.
  const quickDelete = (ev: Occurrence<EventRow>) => {
    if (ev.recurrence_rule) {
      setScope({
        mode: 'delete',
        series: { ...ev, start: ev._seriesStart, end: ev._seriesEnd },
        occStartIso: ev.start,
        occDayKey: dayKey(ev.start),
        patch: null,
      })
      return
    }
    void deleteWithUndo({ id: ev.id, expectedVersion: ev.version })
  }

  // 반복 occurrence 편집/삭제는 범위 시트로 분기(조사 01 §1/§6). 비반복은 곧장 plain 적용.
  const onUpdate = (id: string, v: number, patch: EventPatch) => {
    const series = sheet.editing
    if (series && series.recurrence_rule && sheet.occStartIso && sheet.occDayKey) {
      setScope({ mode: 'edit', series, occStartIso: sheet.occStartIso, occDayKey: sheet.occDayKey, patch })
      return
    }
    plainUpdate(id, v, patch)
  }
  const onDelete = (id: string, v: number) => {
    const series = sheet.editing
    if (series && series.recurrence_rule && sheet.occStartIso && sheet.occDayKey) {
      setScope({ mode: 'delete', series, occStartIso: sheet.occStartIso, occDayKey: sheet.occDayKey, patch: null })
      return
    }
    plainDelete(id, v)
  }

  // patch → NewEvent(override/새 시리즈 생성용). owner_id는 create가 myId로 채움(RLS WITH CHECK).
  const patchToNewEvent = (series: EventRow, patch: EventPatch, recurrenceRule: string | null): NewEvent => ({
    title: patch.title ?? series.title,
    start: patch.start ?? series.start,
    end: patch.end ?? series.end,
    isAllDay: patch.is_all_day ?? series.is_all_day,
    timeZone: series.time_zone,
    visibility: patch.visibility ?? series.visibility,
    placeId: patch.place_id !== undefined ? patch.place_id : series.place_id,
    memo: patch.memo !== undefined ? patch.memo : series.memo,
    recurrenceRule,
    reminders: patch.reminders ?? series.reminders,
  })

  // 범위 시트에서 고른 범위를 적용. 'this'=EXDATE(+override), 'following'=시리즈 분할, 'all'=plain.
  const applyScope = (pick: Scope) => {
    if (!scope) return
    const { mode, series, occStartIso, occDayKey, patch } = scope
    const rule = series.recurrence_rule
    if (!rule) {
      setScope(null)
      return
    }

    if (pick === 'all') {
      setScope(null)
      if (mode === 'delete') plainDelete(series.id, series.version)
      else if (patch) plainUpdate(series.id, series.version, patch)
      return
    }

    if (pick === 'this') {
      // 이 회차 제외(EXDATE append) — softDelete 아님. 시리즈 update 1건.
      const exRule = exdateOccurrence(rule, occDayKey)
      setScope(null)
      if (mode === 'delete') {
        update.mutate(
          { id: series.id, expectedVersion: series.version, patch: { recurrence_rule: exRule } },
          {
            onSuccess: () => {
              closeSheet()
              toast.show({ message: '이 일정만 삭제했어요' })
            },
            onError: (err) => {
              if (err instanceof ConflictError) conflict.flag()
            },
          },
        )
      } else if (patch) {
        // override 는 클릭한 occurrence 날(occDayKey)에 떨어져야 한다 — 폼 start/end는 시리즈 앵커 날
        // 기준이므로 occDayKey로 평행이동(벽시계·기간 보존). 안 하면 앵커 날에 잘못 생기고 회차는 EXDATE로 사라짐.
        const base = patchToNewEvent(series, patch, null)
        const occ = shiftTimesToOccurrence(base.start, base.end, occDayKey)
        const override = { ...base, start: occ.start, end: occ.end }
        // EXDATE update 성공 후 override create(비반복 단일·내 소유) — 부분실패 방어(§6: 순서 보장).
        update.mutate(
          { id: series.id, expectedVersion: series.version, patch: { recurrence_rule: exRule } },
          {
            onSuccess: () => create.mutate(override, { onSuccess: closeSheet }),
            onError: (err) => {
              if (err instanceof ConflictError) conflict.flag()
            },
          },
        )
      }
      return
    }

    // pick === 'following' — 분할일 직전까지 시리즈 절단(UNTIL). 삭제면 절단만, 수정이면 새 시리즈 생성.
    const { truncatedRule } = splitFollowing(rule, occStartIso)
    setScope(null)
    update.mutate(
      { id: series.id, expectedVersion: series.version, patch: { recurrence_rule: truncatedRule } },
      {
        onSuccess: () => {
          if (mode === 'delete') {
            closeSheet()
            toast.show({ message: '이후 일정을 삭제했어요' })
            return
          }
          if (!patch) return
          // 새 시리즈: 분할 occurrence 시작부터, 원 freq/interval 유지(COUNT/UNTIL은 새로 안 둠 → 계속).
          const p = parseRule(rule)
          const newRule = p ? buildRule(p.freq, p.interval) : rule
          // start/end 둘 다 occDayKey로 평행이동 — start만 occStartIso로 두고 end를 앵커 날에 남기면
          // 첫 회차(및 전개되는 모든 회차)가 음수/다중일 기간이 된다(이슈 #2). 벽시계·기간 보존.
          const base = patchToNewEvent(series, patch, newRule)
          const occ = shiftTimesToOccurrence(base.start, base.end, occDayKey)
          const newEvent = { ...base, start: occ.start, end: occ.end }
          create.mutate(newEvent, { onSuccess: closeSheet })
        },
        onError: (err) => {
          if (err instanceof ConflictError) conflict.flag()
        },
      },
    )
  }

  return (
    <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
      <div className={styles.container}>
        {conflict.conflict ? <ConflictBanner onDismiss={conflict.clear} /> : null}
        {permission.conflict ? (
          <ConflictBanner message="이 일정은 상대만 수정할 수 있어요." onDismiss={permission.clear} />
        ) : null}

        <ViewSegment mode={mode} onChange={changeMode} />

        {mode === 'day' ? (
          <DayTimeline
            dateKey={selected}
            occurrences={dayEvents}
            myId={myId}
            onEdit={openEdit}
            onAdd={openCreate}
          />
        ) : (
          <>
            {mode === 'month' ? (
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
            ) : null}

            <TrackLegend />
            <TrackChips filter={filter} onToggle={toggleTrack} />

            {mode === 'month' ? (
              <MonthGrid
                cells={cells}
                grouped={grouped}
                selected={selected}
                todayKey={todayKey}
                myId={myId}
                onSelect={setSelected}
              />
            ) : (
              <WeekStrip
                selected={selected}
                todayKey={todayKey}
                hasEventsByKey={(key) => (grouped[key]?.length ?? 0) > 0}
                onSelect={setSelected}
              />
            )}

            <DayAgenda
              dateKey={selected}
              events={dayEvents}
              myId={myId}
              profiles={profiles ?? {}}
              placeById={placeById}
              onEdit={openEdit}
              onAdd={openCreate}
              onDelete={quickDelete}
            />
          </>
        )}

        <button type="button" className={styles.fab} onClick={openCreate} aria-label="일정 추가">
          ＋
        </button>
      </div>

      {sheet.open ? (
        <EventSheet
          initial={sheet.editing}
          defaultDate={selected}
          myId={myId}
          busy={busy}
          profiles={profiles ?? {}}
          conflictRefresh={conflictRefresh}
          onClose={closeSheet}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ) : null}

      {scope ? (
        <ScopeSheet mode={scope.mode} onPick={applyScope} onCancel={() => setScope(null)} />
      ) : null}
    </ScreenScaffold>
  )
}

// 뷰 전환 세그먼트(월/주/일, Task 12) — aria-pressed로 현재 뷰. 색 단독 아님(텍스트 라벨).
const VIEW_LABELS: { key: 'month' | 'week' | 'day'; label: string }[] = [
  { key: 'month', label: '월' },
  { key: 'week', label: '주' },
  { key: 'day', label: '일' },
]
function ViewSegment({
  mode,
  onChange,
}: {
  mode: 'month' | 'week' | 'day'
  onChange: (m: 'month' | 'week' | 'day') => void
}) {
  return (
    <div className={styles.viewSeg} role="group" aria-label="달력 뷰 전환">
      {VIEW_LABELS.map((v) => {
        const on = mode === v.key
        return (
          <button
            key={v.key}
            type="button"
            className={`${styles.viewSegBtn} ${on ? styles.viewSegBtnOn : ''}`}
            aria-pressed={on}
            aria-label={`${v.label} 뷰`}
            onClick={() => onChange(v.key)}
          >
            {v.label}
          </button>
        )
      })}
    </div>
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
            {/* 제목 칩 앞 2개 + `+N` overflow(조사 01 §4). 색 단독 금지(§8) → 트랙 심볼(●▲■) 텍스트 동반.
                칩은 비인터랙티브 span(중첩 버튼 회피 — 셀 button 하나만 탭 대상). */}
            <span className={styles.cellChips}>
              {evs.slice(0, 2).map((e) => {
                const t = deriveTrack(e, myId)
                return (
                  <span key={e.id} className={styles.cellChip} style={{ color: TRACK_META[t].cssVar }} aria-hidden>
                    {TRACK_META[t].symbol} {e.title}
                  </span>
                )
              })}
              {evs.length > 2 ? (
                <span className={styles.chipMore} aria-hidden>
                  +{evs.length - 2}
                </span>
              ) : null}
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
  placeById,
  onEdit,
  onAdd,
  onDelete,
}: {
  dateKey: string
  events: Occurrence<EventRow>[]
  myId: string | null
  profiles: ProfileMap
  placeById: Record<string, PlaceRow>
  onEdit: (ev: Occurrence<EventRow>) => void
  onAdd: () => void
  onDelete: (ev: Occurrence<EventRow>) => void
}) {
  // 목록 바로 삭제도 EventSheet와 같은 계약: 1탭은 지우지 않고 인라인 확인 먼저(실수 삭제 방지).
  const [confirmId, setConfirmId] = useState<string | null>(null)
  return (
    <section className={styles.agenda} aria-label={`${dateKey} 일정`}>
      <h2 className={styles.agendaTitle}>{dateKey}</h2>
      {events.length === 0 ? (
        // 연결됨-빈: 죽은 <p> 대신 친근한 EmptyState + add-event CTA(§7).
        <EmptyState
          emoji="🗓️"
          title="이 날 일정이 없어요"
          action={
            <button type="button" className={styles.agendaAddBtn} onClick={onAdd}>
              ＋ 일정 추가
            </button>
          }
        />
      ) : (
        <ul className={styles.eventList}>
          {events.map((ev) => {
            const t = deriveTrack(ev, myId)
            const meta = TRACK_META[t]
            // place_id가 가리키는 장소가 우리 목록에 있으면 칩+지도 딥링크(?place=)를 함께 표시.
            // (지도쪽 ?place= 포커스 수신은 후속 패킷 — 여기선 딥링크 발신만, 조사 04 §3.)
            const place = ev.place_id ? placeById[ev.place_id] : undefined
            return (
              <li key={ev.id}>
                <div className={styles.eventRow}>
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
                  {/* 상세 진입 없이 바로 삭제 — 1탭=인라인 확인, 2탭=삭제(비반복: Undo 토스트 / 반복: 범위 시트). */}
                  {confirmId === ev.id ? (
                    <button
                      type="button"
                      className={`${styles.eventDeleteBtn} ${styles.eventDeleteConfirm}`}
                      onClick={() => {
                        setConfirmId(null)
                        onDelete(ev)
                      }}
                    >
                      정말 삭제할까요?
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.eventDeleteBtn}
                      onClick={() => setConfirmId(ev.id)}
                      aria-label={`${ev.title} 휴지통으로 보내기`}
                    >
                      <span aria-hidden="true">🗑</span>
                    </button>
                  )}
                </div>
                {place ? (
                  // 칩은 항목 버튼 밖(중첩 인터랙티브 회피) — 지도로 가는 별도 링크.
                  <a className={styles.placeChip} href={`/?place=${ev.place_id}`} aria-label={`지도에서 ${place.name} 보기`}>
                    📍 {place.name}
                  </a>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
