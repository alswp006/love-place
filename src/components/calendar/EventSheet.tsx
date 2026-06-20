import { useState, useEffect, useRef, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { EventRow } from '@/hooks/useEvents'
import type { NewEvent, EventPatch } from '@/hooks/useEventMutations'
import { dayKey, formatTime, DISPLAY_TZ } from '@/lib/calendar/eventDays'
import { parseRule, buildRule, type Freq } from '@/lib/calendar/rrule'
import styles from './EventSheet.module.css'

// 한국(Asia/Seoul, DST 없음) 고정 오프셋으로 벽시계 시각 → ISO. 이벤트별 tz는 후속 정교화.
function toIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00+09:00`).toISOString()
}

type Props = {
  initial: EventRow | null // 있으면 수정 모드
  defaultDate: string // 생성 시 기본 날짜(선택된 날)
  myId: string | null // 사용자별 리마인더 소유자
  busy: boolean
  onClose: () => void
  onCreate: (e: NewEvent) => void
  onUpdate: (id: string, expectedVersion: number, patch: EventPatch) => void
  onDelete: (id: string, expectedVersion: number) => void
}

export function EventSheet({ initial, defaultDate, myId, busy, onClose, onCreate, onUpdate, onDelete }: Props) {
  const editing = initial != null
  const [title, setTitle] = useState(initial?.title ?? '')
  const [date, setDate] = useState(initial ? dayKey(initial.start) : defaultDate)
  const [allDay, setAllDay] = useState(initial?.is_all_day ?? false)
  const [startTime, setStartTime] = useState(initial && !initial.is_all_day ? formatTime(initial.start) : '10:00')
  const [endTime, setEndTime] = useState(initial && !initial.is_all_day ? formatTime(initial.end) : '11:00')
  const [visibility, setVisibility] = useState<'SHARED' | 'PERSONAL'>(initial?.visibility ?? 'SHARED')
  const [memo, setMemo] = useState(initial?.memo ?? '')
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

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

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
    const start = allDay ? toIso(date, '00:00') : toIso(date, startTime)
    const end = allDay ? toIso(date, '23:59') : toIso(date, endTime)
    const cleanMemo = memo.trim() || null
    const recurrenceRule =
      recurrence === 'none' ? null : buildRule(recurrence, 1, recurCount > 0 ? recurCount : undefined, initRule?.exdates)
    // 사용자별 리마인더: 상대 것은 보존, 내 것만 갱신(§4.2 사용자별).
    const others = (initial?.reminders ?? []).filter((r) => r.userId !== myId)
    const reminders = myReminder > 0 && myId ? [...others, { userId: myId, offsetMinutes: myReminder }] : others
    if (editing && initial) {
      onUpdate(initial.id, initial.version, {
        title: t,
        start,
        end,
        is_all_day: allDay,
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
        <form onSubmit={onSubmit} className={styles.form}>
          <input
            ref={titleRef}
            className={styles.input}
            placeholder="일정 제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="일정 제목"
          />

          <label className={styles.field}>
            <span>날짜</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="날짜" />
          </label>

          <label className={styles.checkRow}>
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            <span>종일</span>
          </label>

          {!allDay ? (
            <div className={styles.timeRow}>
              <label className={styles.field}>
                <span>시작</span>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} aria-label="시작 시각" />
              </label>
              <label className={styles.field}>
                <span>종료</span>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-label="종료 시각" />
              </label>
            </div>
          ) : null}

          <fieldset className={styles.tracks}>
            <legend>트랙</legend>
            <label className={styles.radio}>
              <input
                type="radio"
                name="visibility"
                checked={visibility === 'SHARED'}
                onChange={() => setVisibility('SHARED')}
              />
              <span>● 함께</span>
            </label>
            <label className={styles.radio}>
              <input
                type="radio"
                name="visibility"
                checked={visibility === 'PERSONAL'}
                onChange={() => setVisibility('PERSONAL')}
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
              />
            </label>
          ) : null}

          <label className={styles.field}>
            <span>내 리마인더</span>
            <select value={myReminder} onChange={(e) => setMyReminder(Number(e.target.value))} aria-label="내 리마인더">
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
          />

          <div className={styles.actions}>
            {editing && initial ? (
              confirmingDelete ? (
                <button
                  type="button"
                  className={styles.confirmDelete}
                  onClick={() => onDelete(initial.id, initial.version)}
                  disabled={busy}
                >
                  정말 삭제할까요?
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.delete}
                  onClick={() => setConfirmingDelete(true)}
                  disabled={busy}
                >
                  삭제
                </button>
              )
            ) : null}
            <span className={styles.spacer} />
            <button type="button" className={styles.cancel} onClick={onClose}>
              취소
            </button>
            <button type="submit" className={styles.save} disabled={busy || !title.trim()}>
              {editing ? '수정' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
