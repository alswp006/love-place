import { useMemo, useState } from 'react'
import type { PlaceRow } from '@/hooks/usePlaces'
import styles from './PlacePicker.module.css'

type Props = {
  places: PlaceRow[]
  loading: boolean
  selectedId: string | null
  onPick: (id: string | null) => void
}

export function PlacePicker({ places, loading, selectedId, onPick }: Props) {
  const [q, setQ] = useState('')
  const selected = useMemo(() => places.find((p) => p.id === selectedId) ?? null, [places, selectedId])
  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    const base = t ? places.filter((p) => p.name.toLowerCase().includes(t) || (p.address ?? '').toLowerCase().includes(t)) : places
    return base.slice(0, 8)
  }, [places, q])

  if (selected) {
    return (
      <div className={styles.chip}>
        <span aria-hidden>📍</span>
        <span className={styles.chipLabel}>{selected.name}</span>
        <button type="button" className={styles.chipRemove} aria-label="장소 연결 해제" onClick={() => onPick(null)}>×</button>
      </div>
    )
  }
  return (
    <div className={styles.picker}>
      <input
        type="search" className={styles.input} value={q} placeholder="저장된 장소 연결(선택)"
        aria-label="장소 검색" onChange={(e) => setQ(e.target.value)}
      />
      {loading ? (
        <p className={styles.hint} role="status">불러오는 중…</p>
      ) : results.length === 0 ? (
        <p className={styles.hint}>저장된 장소가 없어요. 장소 탭에서 먼저 저장해보세요.</p>
      ) : (
        <ul className={styles.results}>
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" className={styles.result} onClick={() => onPick(p.id)}>
                <span className={styles.resultName}>{p.name}</span>
                <span className={styles.resultAddr}>{p.region_label ?? p.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
