import { useState } from 'react'
import { useEventCategories } from '@/hooks/useEventCategories'
import { NewCategoryForm } from './NewCategoryForm'
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
  const [adding, setAdding] = useState(false)

  const list = categories ?? []

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
            /* 점 대신 칩 자체를 그 분류 색으로 옅게 물들인다 — 이름이 옆에 있으니
               색은 거들 뿐이고(§8), 작은 점보다 훨씬 잘 읽힌다. */
            style={{ '--cat': c.color } as React.CSSProperties}
            aria-pressed={value === c.id}
            onClick={() => onChange(c.id)}
            disabled={disabled}
          >
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
        <NewCategoryForm
          coupleId={coupleId}
          myId={myId}
          disabled={disabled}
          // 만들자마자 그 카테고리를 고른 상태로 — 만들고 다시 고르게 하면 2탭이 된다.
          onCreated={(row) => {
            onChange(row.id)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
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
