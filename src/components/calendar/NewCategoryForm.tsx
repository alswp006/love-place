import { useState } from 'react'
import {
  useEventCategoryMutations,
  CATEGORY_COLORS,
  type EventCategoryRow,
} from '@/hooks/useEventCategories'
import styles from './NewCategoryForm.module.css'

// 새 카테고리 만들기 — 이름 + 색. 상세 시트의 CategoryPicker와 한 줄 추가의 칩 줄이 함께 쓴다.
// 색 견본은 색 자체가 내용이라 텍스트를 못 넣으므로 aria-label로 이름을 주고 선택은 링(형태)으로 낸다(§8).
type Props = {
  coupleId: string | null
  myId: string | null
  onCreated: (row: EventCategoryRow) => void
  onCancel: () => void
  disabled?: boolean
}

export function NewCategoryForm({ coupleId, myId, onCreated, onCancel, disabled = false }: Props) {
  const { create } = useEventCategoryMutations(coupleId, myId)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0])
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    setError(null)
    create.mutate(
      { name, color },
      {
        onSuccess: (row) => {
          setName('')
          onCreated(row)
        },
        onError: (e) => setError(e.message),
      },
    )
  }

  return (
    <div className={styles.box}>
      <input
        className={styles.name}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="카테고리 이름"
        aria-label="새 카테고리 이름"
        maxLength={20}
        disabled={disabled || create.isPending}
      />
      <div className={styles.swatches} role="group" aria-label="카테고리 색">
        {CATEGORY_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={styles.swatch}
            style={{ background: c }}
            aria-label={`색 ${c}`}
            aria-pressed={color === c}
            onClick={() => setColor(c)}
            disabled={disabled || create.isPending}
          />
        ))}
      </div>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.textBtn}
          onClick={() => {
            setError(null)
            onCancel()
          }}
          disabled={create.isPending}
        >
          취소
        </button>
        <button
          type="button"
          className={styles.textBtn}
          onClick={submit}
          disabled={disabled || create.isPending || !name.trim()}
        >
          만들기
        </button>
      </div>
    </div>
  )
}
