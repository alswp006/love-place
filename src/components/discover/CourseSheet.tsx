import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { buildCoursePlan, type CoursePlace, type CourseStop } from '@/lib/route/coursePlan'
import { formatTime } from '@/lib/calendar/eventDays'
import { Button } from '@/components/ui/Button'
import { useScrollLock } from '@/hooks/useScrollLock'
import styles from './CourseSheet.module.css'

type Props = {
  regionLabel: string
  places: CoursePlace[]
  defaultDate: string // 'YYYY-MM-DD'
  busy: boolean
  onCancel: () => void
  onConfirm: (v: { stops: CourseStop[]; dayKeyStr: string; startMin: number }) => void
}

function parseTimeToMin(hhmm: string): number {
  // noUncheckedIndexedAccess: split 결과가 (string|undefined) → 안전 파싱.
  const parts = hhmm.split(':')
  const h = Number.parseInt(parts[0] ?? '', 10)
  const m = Number.parseInt(parts[1] ?? '', 10)
  return (Number.isFinite(h) ? h : 10) * 60 + (Number.isFinite(m) ? m : 0)
}

export function CourseSheet({ regionLabel, places, defaultDate, busy, onCancel, onConfirm }: Props) {
  useScrollLock(true) // 열림=마운트. 뒤 배경 스크롤 차단
  const [date, setDate] = useState(defaultDate)
  const [startTime, setStartTime] = useState('10:00')
  const sheetRef = useRef<HTMLDivElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)

  const startMin = parseTimeToMin(startTime)
  const stops = useMemo(
    () => buildCoursePlan(places, date, { startMin }),
    [places, date, startMin],
  )

  useEffect(() => { dateRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // 포커스 트랩 — EventSheet와 동일.
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const root = sheetRef.current
    if (!root) return
    const items = Array.from(
      root.querySelectorAll<HTMLElement>('button, input, textarea, [href]'),
    ).filter((el) => !el.hasAttribute('disabled'))
    if (items.length === 0) return
    const first = items[0]!
    const last = items[items.length - 1]!
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  const handleConfirm = () => onConfirm({ stops, dayKeyStr: date, startMin })

  return createPortal(
    <div className={styles.backdrop} onClick={onCancel}>
      <div
        ref={sheetRef}
        className={styles.sheet}
        data-sheet-scroll
        role="dialog"
        aria-modal="true"
        aria-label={`${regionLabel} 코스 미리보기`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapTab}
      >
        <h2 className={styles.title}>{regionLabel} 코스</h2>
        <div className={styles.timeRow}>
          <label className={styles.field}>
            날짜
            <input
              ref={dateRef}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            시작 시각
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
        </div>
        <ol className={styles.timeline} aria-label="동선 타임라인">
          {stops.map((s, i) => (
            <li key={s.placeId} className={styles.stop}>
              <span className={styles.order} aria-hidden>{i + 1}</span>
              <span className={styles.stopTime}>{formatTime(s.start)}</span>
              <span className={styles.stopTitle}>{s.title}</span>
            </li>
          ))}
        </ol>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onCancel}>
            취소
          </Button>
          <Button
            variant="cta"
            className={styles.save}
            onClick={handleConfirm}
            disabled={busy || stops.length < 2}
          >
            {busy ? '추가 중…' : '함께 캘린더에 추가'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
