import { useState } from 'react'
import {
  useEventCategories,
  useEventCategoryMutations,
  CATEGORY_COLORS,
} from '@/hooks/useEventCategories'
import styles from './CategoryPicker.module.css'

// 일정 카테고리 선택 + 즉석 생성. 데이터 접근은 여기서 격리한다(CommentThread와 같은 패턴).
// 색만으로 구분하지 않는다(§8): 모든 항목이 색 점 + 이름 텍스트를 함께 낸다. 선택은 aria-pressed로도 알린다.
type Props = {
  coupleId: string | null
  myId: string | null
  value: string | null
  onChange: (categoryId: string | null) => void
  disabled?: boolean
}

export function CategoryPicker({ coupleId, myId, value, onChange, disabled = false }: Props) {
  const { data: categories, isLoading, isError, refetch } = useEventCategories(coupleId)
  const { create } = useEventCategoryMutations(coupleId, myId)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0])
  const [error, setError] = useState<string | null>(null)

  const list = categories ?? []

  const submitNew = () => {
    setError(null)
    create.mutate(
      { name, color },
      {
        // 만들자마자 그 카테고리를 고른 상태로 — 만들고 다시 고르게 하면 2탭이 된다.
        onSuccess: (row) => {
          onChange(row.id)
          setName('')
          setAdding(false)
        },
        onError: (e) => setError(e.message),
      },
    )
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.label} id="category-picker-label">
        카테고리
      </p>
      <div className={styles.chips} role="group" aria-labelledby="category-picker-label">
        <button
          type="button"
          className={styles.chip}
          aria-pressed={value === null}
          onClick={() => onChange(null)}
          disabled={disabled}
        >
          없음
        </button>
        {list.map((c) => (
          <button
            key={c.id}
            type="button"
            className={styles.chip}
            aria-pressed={value === c.id}
            onClick={() => onChange(c.id)}
            disabled={disabled}
          >
            <span className={styles.dot} style={{ background: c.color }} aria-hidden />
            {c.name}
          </button>
        ))}
      </div>

      {isLoading && !isError ? <p className={styles.hint}>불러오는 중…</p> : null}
      {/* 에러는 조용히 숨기지 않는다(ux §7) — 인라인 안내 + 재시도. 새로 만들기는 계속 가능하다. */}
      {isError ? (
        <p role="alert" className={styles.error}>
          카테고리를 불러오지 못했어요.{' '}
          <button type="button" className={styles.textBtn} onClick={() => void refetch()}>
            다시 시도
          </button>
        </p>
      ) : null}
      {!isLoading && !isError && list.length === 0 && !adding ? (
        <p className={styles.hint}>아직 카테고리가 없어요. 하나 만들어 보세요.</p>
      ) : null}

      {adding ? (
        <div className={styles.newBox}>
          <input
            className={styles.newName}
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
          <div className={styles.newActions}>
            <button
              type="button"
              className={styles.textBtn}
              onClick={() => {
                setAdding(false)
                setError(null)
              }}
              disabled={create.isPending}
            >
              취소
            </button>
            <button
              type="button"
              className={styles.textBtn}
              onClick={submitNew}
              disabled={disabled || create.isPending || !name.trim()}
            >
              만들기
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={styles.textBtn}
          onClick={() => setAdding(true)}
          disabled={disabled}
        >
          ＋ 새 카테고리
        </button>
      )}
    </div>
  )
}
