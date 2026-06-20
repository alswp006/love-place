import type { CSSProperties } from 'react'
import { TRASH_KINDS, type TrashRow, type TrashKind } from '@/hooks/useTrash'
import { daysUntilPurge } from '@/lib/trash/purgeDate'
import styles from './TrashSection.module.css'

// 통합 휴지통(R3 T17) — 이질적 엔티티(장소·일정·사진…)를 한 섹션에서 복구.
// 삭제는 물리삭제 아님(soft-delete §4.3). kind 배지는 색만이 아닌 라벨+심볼 병행(§4 색각 이상 대응).
// 삭제일 + "N일 후 영구삭제"(purge horizon)로 복구 유예를 명시.

// kind 배지의 심볼·색(라벨은 TRASH_KINDS[kind].label). 색만으로 구분 금지 → 라벨/심볼과 항상 병행.
const KIND_BADGE: Record<TrashKind, { symbol: string; color: string }> = {
  places: { symbol: '📍', color: '#2563eb' },
  events: { symbol: '📅', color: '#7c3aed' },
  visits: { symbol: '✓', color: '#059669' },
  photos: { symbol: '🖼', color: '#d97706' },
  trips: { symbol: '🧳', color: '#db2777' },
  itineraries: { symbol: '🗺', color: '#0891b2' },
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
              const badgeStyle = {
                '--badge-fg': badge.color,
              } as CSSProperties
              return (
                <li key={`${row.kind}:${row.id}`} className={styles.trashItem}>
                  {/* 색 + 라벨 + 심볼 이중화(§4) — aria-label로 색각 이상 대응 */}
                  <span className={styles.kindBadge} style={badgeStyle} aria-label={kindLabel}>
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
