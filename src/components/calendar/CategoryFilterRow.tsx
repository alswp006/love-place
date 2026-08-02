import { useState } from 'react'
import { useEventCategories } from '@/hooks/useEventCategories'
import { NewCategoryForm } from './NewCategoryForm'
import styles from './CategoryFilterRow.module.css'

// 카테고리 줄 — 두 가지를 동시에 한다(투두메이트와 같은 모델):
//  ① 거르기: 고른 카테고리의 할 일만 목록에 남는다. '전체'면 거르지 않는다.
//  ② 붙이기: 고른 채로 적으면 새 할 일이 그 카테고리로 저장된다('전체'면 분류 없음).
// 하나의 선택이 둘을 겸하므로 "지금 보고 있는 것 = 지금 적는 것"이 어긋나지 않는다.
// 색만으로 구분하지 않는다(§8) — 색 점 + 이름을 함께 내고 선택은 aria-pressed로도 알린다.
type Props = {
  coupleId: string | null
  myId: string | null
  /** null = 전체 */
  value: string | null
  onChange: (categoryId: string | null) => void
  disabled?: boolean
}

export function CategoryFilterRow({ coupleId, myId, value, onChange, disabled = false }: Props) {
  const { data: categories } = useEventCategories(coupleId)
  const [adding, setAdding] = useState(false)
  const list = categories ?? []

  return (
    <div className={styles.wrap}>
      <div className={styles.chips} role="group" aria-label="카테고리">
        <button
          type="button"
          className={styles.chip}
          aria-pressed={value === null}
          onClick={() => onChange(null)}
          disabled={disabled}
        >
          전체
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
        {adding ? null : (
          <button
            type="button"
            className={styles.newChip}
            onClick={() => setAdding(true)}
            disabled={disabled}
          >
            ＋ 새 카테고리
          </button>
        )}
      </div>

      {adding ? (
        <NewCategoryForm
          coupleId={coupleId}
          myId={myId}
          disabled={disabled}
          // 만들자마자 그 카테고리로 좁혀 보여준다 — 방금 만든 분류에 바로 적게.
          onCreated={(row) => {
            onChange(row.id)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}
    </div>
  )
}
