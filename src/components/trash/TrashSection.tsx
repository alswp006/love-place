import { TRASH_KINDS, type TrashRow, type TrashKind } from '@/hooks/useTrash'
import { daysUntilPurge } from '@/lib/trash/purgeDate'
import styles from './TrashSection.module.css'

// 통합 휴지통(R3 T17) — 이질적 엔티티(장소·일정·사진…)를 한 섹션에서 복구.
// 삭제는 물리삭제 아님(soft-delete §4.3). kind 배지는 색만이 아닌 라벨+심볼 병행(§4 색각 이상 대응).
// 삭제일 + "N일 후 영구삭제"(purge horizon)로 복구 유예를 명시.

// kind 배지의 심볼(라벨은 TRASH_KINDS[kind].label). 마시멜로 2색 규율 — 무지개 색 제거,
// 구분은 심볼+라벨이 전담(색만 의존 금지 §4). 배지 색은 단일 토큰(CSS .kindBadge).
const KIND_BADGE: Record<TrashKind, { symbol: string }> = {
  places: { symbol: '📍' },
  events: { symbol: '📅' },
  visits: { symbol: '✓' },
  photos: { symbol: '🖼' },
  trips: { symbol: '🧳' },
  itineraries: { symbol: '🗺' },
}

export function TrashSection({
  open,
  onToggle,
  items,
  busy,
  onRestore,
}: {
  open: boolean
  onToggle: () => void
  items: TrashRow[]
  busy: boolean
  onRestore: (row: TrashRow) => void
}) {
  return (
    <section className={styles.trash} aria-label="휴지통">
      <button type="button" className={styles.trashToggle} onClick={onToggle} aria-expanded={open}>
        <span>🗑 휴지통{open && items.length > 0 ? ` (${items.length})` : ''}</span>
        <span aria-hidden>{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        items.length === 0 ? (
          <p className={styles.trashEmpty}>삭제한 항목이 없어요.</p>
        ) : (
          <ul className={styles.trashList}>
            {items.map((row) => {
              const badge = KIND_BADGE[row.kind]
              const kindLabel = TRASH_KINDS[row.kind].label
              const deletedDate = new Date(row.deleted_at).toLocaleDateString('ko-KR')
              const remaining = daysUntilPurge(row.deleted_at)
              return (
                <li key={`${row.kind}:${row.id}`} className={styles.trashItem}>
                  {/* 심볼 + 라벨 이중화(§4) — 색 단독 의존 안 함(마시멜로 2색). aria-label로 색각 이상 대응 */}
                  <span className={styles.kindBadge} aria-label={kindLabel}>
                    <span aria-hidden>{badge.symbol}</span> {kindLabel}
                  </span>
                  <div className={styles.itemBody}>
                    <span className={styles.trashName}>{row.label}</span>
                    <span className={styles.trashDates}>
                      {deletedDate} 삭제됨 · {remaining}일 후 영구삭제
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.restoreBtn}
                    onClick={() => onRestore(row)}
                    disabled={busy}
                  >
                    복구
                  </button>
                </li>
              )
            })}
          </ul>
        )
      ) : null}
    </section>
  )
}
