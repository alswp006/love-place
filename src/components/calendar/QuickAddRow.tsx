import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { buildEventTimes } from '@/lib/calendar/eventTimes'
import { DISPLAY_TZ } from '@/lib/calendar/eventDays'
import type { NewEvent } from '@/hooks/useEventMutations'
import styles from './QuickAddRow.module.css'

// 한 줄 추가 — 제목만 넣고 엔터로 끝낸다(투두메이트식 빠른 입력).
// EventSheet(12개 입력)는 시간·반복·리마인더까지 정하는 '제대로 만들기' 경로로 남기고,
// 여기는 "일단 적어두기"만 담당한다. 나머지는 항목을 탭해 나중에 붙이면 된다.
//
// 종일(is_all_day)로 만드는 이유: 할 일에는 대개 시작·종료 시각이 없다.
// 시각을 임의로 지어내면(예: 10:00) 캘린더 타임라인에 없는 약속이 생긴다.
// 종일 start/end 조립은 buildEventTimes를 그대로 써서 EventSheet와 규약을 일치시킨다.
type Props = {
  /** 'YYYY-MM-DD' — 이 날짜에 추가한다. */
  dateKey: string
  onCreate: (e: NewEvent, done: () => void) => void
  disabled?: boolean
}

export function QuickAddRow({ dateKey, onCreate, disabled = false }: Props) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t || busy || disabled) return
    const times = buildEventTimes({ date: dateKey, allDay: true, timeZone: DISPLAY_TZ })
    if (!times.ok) return // 종일은 같은 날짜면 실패할 수 없지만 타입상 방어
    setBusy(true)
    onCreate(
      {
        title: t,
        start: times.start,
        end: times.end,
        isAllDay: true,
        timeZone: DISPLAY_TZ,
        // 한 줄 추가는 '내 할 일'을 적는 자리다 — 기본은 나만(PERSONAL).
        // 공유가 기본값(§1)인 것은 데이터 접근 얘기이고, PERSONAL도 둘 다 보이며 색만 갈린다(§4.2).
        // 즉 여기서 PERSONAL은 상대에게 숨기는 게 아니라 '내 트랙에 놓는다'는 뜻이다.
        // 함께 할 일이면 항목을 눌러 EventSheet에서 '● 함께'로 바꾼다.
        visibility: 'PERSONAL',
      },
      () => {
        // 연속 입력: 입력값만 비우고 포커스는 유지한다(키보드가 내려가지 않게).
        setTitle('')
        setBusy(false)
        inputRef.current?.focus()
      },
    )
  }

  // ESC로 입력 중단(모달이 아니라 인라인이므로 포커스만 뗀다).
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setTitle('')
      inputRef.current?.blur()
    }
  }

  return (
    <form className={styles.row} onSubmit={submit} aria-label="빠른 일정 추가">
      <span className={styles.plus} aria-hidden>
        ＋
      </span>
      <input
        ref={inputRef}
        className={styles.input}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="할 일을 적고 엔터"
        aria-label={`${dateKey}에 할 일 추가`}
        enterKeyHint="done"
        disabled={disabled}
      />
      {/* 엔터가 주 경로지만 버튼도 둔다 — 제스처/키보드만으로 되는 기능은 발견성이 낮다(ux §1). */}
      <button
        type="submit"
        className={styles.submit}
        disabled={disabled || busy || !title.trim()}
        aria-label="추가"
      >
        추가
      </button>
    </form>
  )
}
