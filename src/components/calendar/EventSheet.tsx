import { useState, useEffect, useRef, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type TouchEvent as ReactTouchEvent } from 'react'
import type { EventRow } from '@/hooks/useEvents'
import type { ProfileMap } from '@/hooks/useProfiles'
import type { NewEvent, EventPatch } from '@/hooks/useEventMutations'
import { dayKey, formatTime, DISPLAY_TZ } from '@/lib/calendar/eventDays'
import { tzNote } from '@/lib/calendar/tzLabel'
import { parseRule, buildRule, type Freq } from '@/lib/calendar/rrule'
import { buildEventTimes } from '@/lib/calendar/eventTimes'
import { Button } from '@/components/ui/Button'
import styles from './EventSheet.module.css'

type Props = {
  initial: EventRow | null // 있으면 수정 모드
  defaultDate: string // 생성 시 기본 날짜(선택된 날)
  myId: string | null // 사용자별 리마인더 소유자
  busy: boolean
  profiles: ProfileMap // 소유자 이름 표시(상대 PERSONAL 라벨)
  // 버전충돌 후 부모가 재조회한 최신 서버 행(Task 7). version 재시드 + 메모 append-merge에 쓴다.
  conflictRefresh?: { version: number; memo: string | null } | null
  onClose: () => void
  onCreate: (e: NewEvent) => void
  onUpdate: (id: string, expectedVersion: number, patch: EventPatch) => void
  onDelete: (id: string, expectedVersion: number) => void
}

export function EventSheet({ initial, defaultDate, myId, busy, profiles, conflictRefresh, onClose, onCreate, onUpdate, onDelete }: Props) {
  const editing = initial != null
  // 상대 PERSONAL 일정은 읽기 전용(canEdit 가드, 조사03 §4 — RLS USING 미러).
  // canEdit = visibility==='SHARED' || owner_id===myId. 상대 PERSONAL이면 입력·저장·삭제 차단.
  const isPartnerPersonal =
    editing && initial != null && initial.visibility === 'PERSONAL' && myId != null && initial.owner_id !== myId
  const canEdit = !isPartnerPersonal
  const ownerName = initial ? (profiles[initial.owner_id]?.displayName ?? '상대') : ''
  // 이벤트가 다른 tz로 저장됐으면 그 tz로 날짜/시각을 표시(여행 현지시각). 신규 생성은 DISPLAY_TZ.
  const evTz = initial?.time_zone || DISPLAY_TZ
  const [title, setTitle] = useState(initial?.title ?? '')
  const [date, setDate] = useState(initial ? dayKey(initial.start, evTz) : defaultDate)
  const [allDay, setAllDay] = useState(initial?.is_all_day ?? false)
  const [endDate, setEndDate] = useState(initial ? dayKey(initial.end, evTz) : defaultDate)
  const [startTime, setStartTime] = useState(initial && !initial.is_all_day ? formatTime(initial.start, evTz) : '10:00')
  const [endTime, setEndTime] = useState(initial && !initial.is_all_day ? formatTime(initial.end, evTz) : '11:00')
  const [timeError, setTimeError] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<'SHARED' | 'PERSONAL'>(initial?.visibility ?? 'SHARED')
  // 일정 폼은 '일정만' 관리한다 — 장소 연결 필드 없음. 기존 place_id(추천 코스→일정 addCourse·지도 연동)는
  // 폼이 건드리지 않는다: 수정 시 EventPatch에서 place_id를 생략하면 서버 값이 그대로 보존된다(map linkage 유지).
  const [memo, setMemo] = useState(initial?.memo ?? '')
  // 낙관적 락 기준 버전 — 기본은 원본 version, 버전충돌 후엔 재조회 버전으로 재시드(다음 저장이 같은 충돌 반복 방지).
  const [expectedVersion, setExpectedVersion] = useState(initial?.version ?? 0)
  const initRule = parseRule(initial?.recurrence_rule)
  const [recurrence, setRecurrence] = useState<Freq | 'none'>(initRule?.freq ?? 'none')
  const [recurCount, setRecurCount] = useState(initRule?.count ?? 10)
  const [myReminder, setMyReminder] = useState(
    initial?.reminders?.find((r) => r.userId === myId)?.offsetMinutes ?? 0,
  )
  // 삭제는 1탭으로 바로 지우지 않고 인라인 확인을 거친다(실수 삭제 방지, R1.5). 확인 시 onDelete → Undo 토스트.
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  // 스와이프 다운 닫기(§1/§5): 핸들에서 아래로 끌어 임계(120px) 초과 시 onClose. 미만은 스냅백.
  // 버튼(취소/닫기)·Esc 대체 경로는 그대로 유지(제스처 단독 금지 — 발견성).
  const dragStartY = useRef<number | null>(null)
  const dragY = useRef(0)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const onHandleTouchStart = (e: ReactTouchEvent) => {
    dragStartY.current = e.touches[0]?.clientY ?? null
    dragY.current = 0
  }
  const onHandleTouchMove = (e: ReactTouchEvent) => {
    if (dragStartY.current == null) return
    const y = e.touches[0]?.clientY ?? dragStartY.current
    dragY.current = Math.max(0, y - dragStartY.current)
  }
  const onHandleTouchEnd = () => {
    const moved = dragY.current
    dragStartY.current = null
    dragY.current = 0
    if (moved > 120) onClose()
  }

  // 버전충돌 후 부모가 내려준 최신 서버 행으로 재시드(Task 7, §4.3 LWW 금지):
  //  (1) expectedVersion을 서버 version으로 갱신 → 다음 저장이 같은 충돌을 반복하지 않음.
  //  (2) 메모 손실 방지(CLAUDE.md §4): 내 미저장 메모와 서버 메모가 다르면 `\n---\n`로 append-merge.
  useEffect(() => {
    if (!conflictRefresh) return
    setExpectedVersion(conflictRefresh.version)
    const server = conflictRefresh.memo ?? ''
    setMemo((prev) => {
      if (!server) return prev
      if (!prev) return server
      return prev !== server ? `${prev}\n---\n${server}` : prev
    })
  }, [conflictRefresh])

  // 포커스 트랩(§8) — Tab이 시트 밖으로 새지 않게 첫/마지막 포커서블을 순환.
  const trapTab = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab' || !sheetRef.current) return
    const els = Array.from(
      sheetRef.current.querySelectorAll<HTMLElement>('button, input, textarea, [href]'),
    ).filter((el) => !el.hasAttribute('disabled'))
    if (els.length === 0) return
    const first = els[0]!
    const last = els[els.length - 1]!
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    // 시간 검증(buildEventTimes, Task 1) — 동일/역전이면 인라인 에러 + 입력 보존, DB 도달 차단(§5.2).
    // 저장 tz = 표시 tz(evTz). 표시 경로(L40-44)가 evTz로 벽시계를 채우므로 저장도 evTz로 해석해야
    // 대칭 — 비-DISPLAY_TZ 이벤트를 손대지 않고 저장해도 무음 드리프트(LWW 금지, §4)가 없다.
    const times = buildEventTimes({ date, allDay, startTime, endTime, endDate, timeZone: evTz })
    if (!times.ok) {
      setTimeError(
        times.reason === 'same'
          ? '시작·종료 시간이 같아요. 종료를 더 늦게 잡아주세요.'
          : times.reason === 'range'
            ? '종료일이 시작일보다 빨라요.'
            : '시작·종료 시간을 입력해주세요.',
      )
      return
    }
    setTimeError(null)
    const { start, end } = times
    const cleanMemo = memo.trim() || null
    const recurrenceRule =
      recurrence === 'none' ? null : buildRule(recurrence, 1, recurCount > 0 ? recurCount : undefined, initRule?.exdates)
    // 사용자별 리마인더: 상대 것은 보존, 내 것만 갱신(§4.2 사용자별).
    const others = (initial?.reminders ?? []).filter((r) => r.userId !== myId)
    const reminders = myReminder > 0 && myId ? [...others, { userId: myId, offsetMinutes: myReminder }] : others
    if (editing && initial) {
      onUpdate(initial.id, expectedVersion, {
        title: t,
        start,
        end,
        is_all_day: allDay,
        // 이벤트 tz를 그대로 기록(여행 현지시각 보존) — start/end가 evTz 벽시계로 빌드됐으므로 tz 컬럼도 일치시켜야
        // 다음 표시/저장 round-trip이 동일하다(컬럼 드리프트 방지).
        time_zone: evTz,
        visibility,
        memo: cleanMemo,
        recurrence_rule: recurrenceRule,
        reminders,
      })
    } else {
      onCreate({
        title: t,
        start,
        end,
        isAllDay: allDay,
        timeZone: DISPLAY_TZ,
        visibility,
        memo: cleanMemo,
        recurrenceRule,
        reminders,
      })
    }
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? '일정 수정' : '일정 만들기'}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapTab}
      >
        <div
          className={styles.handle}
          data-testid="sheet-handle"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          aria-hidden="true"
        >
          <span className={styles.grip} />
        </div>
        <form onSubmit={onSubmit} className={styles.form}>
          {isPartnerPersonal ? (
            <p className={styles.readonlyLabel}>상대 일정 · {ownerName}</p>
          ) : null}
          <input
            ref={titleRef}
            className={styles.input}
            placeholder="일정 제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="일정 제목"
            disabled={!canEdit}
          />

          <label className={styles.field}>
            <span>날짜</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="날짜" disabled={!canEdit} />
          </label>

          {/* 이벤트 tz가 표시 tz와 다르면 현지시각 노트(여행 tz). 텍스트 — 색 비의존(§a11y). */}
          {editing && initial && tzNote(initial.start, evTz, DISPLAY_TZ) ? (
            <p className={styles.tzNote}>{tzNote(initial.start, evTz, DISPLAY_TZ)}</p>
          ) : null}

          <label className={styles.checkRow}>
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} disabled={!canEdit} />
            <span>종일</span>
          </label>

          {!allDay ? (
            <div className={styles.timeRow}>
              <label className={styles.field}>
                <span>시작</span>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} aria-label="시작 시각" disabled={!canEdit} />
              </label>
              <label className={styles.field}>
                <span>종료</span>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-label="종료 시각" disabled={!canEdit} />
              </label>
            </div>
          ) : (
            <label className={styles.field}>
              <span>종료일</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label="종료일" disabled={!canEdit} />
            </label>
          )}

          <fieldset className={styles.tracks}>
            <legend>트랙</legend>
            <label className={styles.radio}>
              <input
                type="radio"
                name="visibility"
                checked={visibility === 'SHARED'}
                onChange={() => setVisibility('SHARED')}
                disabled={!canEdit}
              />
              <span>● 함께</span>
            </label>
            <label className={styles.radio}>
              <input
                type="radio"
                name="visibility"
                checked={visibility === 'PERSONAL'}
                onChange={() => setVisibility('PERSONAL')}
                disabled={!canEdit}
              />
              <span>▲ 나만</span>
            </label>
          </fieldset>

          <label className={styles.field}>
            <span>반복</span>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as Freq | 'none')}
              aria-label="반복"
              disabled={!canEdit}
            >
              <option value="none">안 함</option>
              <option value="DAILY">매일</option>
              <option value="WEEKLY">매주</option>
              <option value="MONTHLY">매월</option>
            </select>
          </label>
          {recurrence !== 'none' ? (
            <label className={styles.field}>
              <span>반복 횟수 (0=계속)</span>
              <input
                type="number"
                min={0}
                max={365}
                value={recurCount}
                onChange={(e) => setRecurCount(Number(e.target.value) || 0)}
                aria-label="반복 횟수"
                disabled={!canEdit}
              />
            </label>
          ) : null}

          <label className={styles.field}>
            <span>내 리마인더</span>
            <select value={myReminder} onChange={(e) => setMyReminder(Number(e.target.value))} aria-label="내 리마인더" disabled={!canEdit}>
              <option value={0}>없음</option>
              <option value={10}>10분 전</option>
              <option value={60}>1시간 전</option>
              <option value={1440}>1일 전</option>
            </select>
          </label>

          <textarea
            className={styles.memo}
            placeholder="메모(선택)"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            aria-label="메모"
            rows={2}
            disabled={!canEdit}
          />

          {timeError ? (
            <p role="alert" className={styles.formError}>
              {timeError}
            </p>
          ) : null}

          <div className={styles.actions}>
            {canEdit && editing && initial ? (
              confirmingDelete ? (
                <Button
                  variant="danger"
                  onClick={() => onDelete(initial.id, expectedVersion)}
                  disabled={busy}
                >
                  정말 삭제할까요?
                </Button>
              ) : (
                <Button variant="danger" onClick={() => setConfirmingDelete(true)} disabled={busy}>
                  삭제
                </Button>
              )
            ) : null}
            <span className={styles.spacer} />
            <Button variant="ghost" onClick={onClose}>
              {canEdit ? '취소' : '닫기'}
            </Button>
            {canEdit ? (
              <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
                {editing ? '수정' : '저장'}
              </Button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  )
}
