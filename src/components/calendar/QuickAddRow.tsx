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
//
// 트랙(visibility)·카테고리는 부모가 정한다 — 지금 보고 있는 캘린더/분류에 그대로 들어가야
// "함께 탭에서 적었는데 내 일정이 되는" 어긋남이 생기지 않는다.
type Props = {
  /** 'YYYY-MM-DD' — 이 날짜에 추가한다. */
  dateKey: string
  /** 지금 보고 있는 트랙 — 함께 캘린더에서 적으면 함께 일정이 된다. */
  visibility: 'SHARED' | 'PERSONAL'
  /** 지금 고른 카테고리(null = 전체 → 분류 없음). */
  categoryId: string | null
  onCreate: (e: NewEvent, done: () => void) => void
  disabled?: boolean
}

export function QuickAddRow({
  dateKey,
  visibility,
  categoryId,
  onCreate,
  disabled = false,
}: Props) {
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
        visibility,
        categoryId,
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
        placeholder="할 일 입력"
        aria-label={`${dateKey}에 할 일 추가`}
        enterKeyHint="done"
        disabled={disabled}
      />
      {/* 엔터가 주 경로지만 버튼도 둔다 — 키보드만으로 되는 기능은 발견성이 낮다(ux §1).
          다만 비어 있을 땐 숨긴다: 쉬는 상태의 글자를 '＋ 할 일 입력' 하나로 줄이기 위해서다.
          아이콘만 남으므로 접근 이름은 aria-label로 준다(§4 아이콘 전용 컨트롤). */}
      {title.trim() ? (
        <button
          type="submit"
          className={styles.submit}
          disabled={disabled || busy}
          aria-label="추가"
        >
          ↵
        </button>
      ) : null}
    </form>
  )
}
