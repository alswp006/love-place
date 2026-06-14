import type { TrashPlaceRow } from '@/hooks/usePlaceTrash'
import styles from './TrashSection.module.css'

// 휴지통(D3) — 삭제는 복구 가능(물리삭제 아님). "상대가 지운 우리 추억"도 둘 다 복구.
export function TrashSection({
  open,
  onToggle,
  items,
  busy,
  onRestore,
}: {
  open: boolean
  onToggle: () => void
  items: TrashPlaceRow[]
  busy: boolean
  onRestore: (t: TrashPlaceRow) => void
}) {
  return (
    <section className={styles.trash} aria-label="휴지통">
      <button type="button" className={styles.trashToggle} onClick={onToggle} aria-expanded={open}>
        <span>🗑 휴지통{open && items.length > 0 ? ` (${items.length})` : ''}</span>
        <span aria-hidden>{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        items.length === 0 ? (
          <p className={styles.trashEmpty}>삭제한 장소가 없어요.</p>
        ) : (
          <ul className={styles.trashList}>
            {items.map((t) => (
              <li key={t.id} className={styles.trashItem}>
                <span className={styles.trashName}>{t.name}</span>
                <button
                  type="button"
                  className={styles.restoreBtn}
                  onClick={() => onRestore(t)}
                  disabled={busy}
                >
                  복구
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  )
}
