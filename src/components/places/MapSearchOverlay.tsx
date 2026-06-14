import { PlaceSearch } from '@/components/places/PlaceSearch'
import styles from './MapSearchOverlay.module.css'

// 지도 위 상단 검색 오버레이(spec §5) — PlaceSearch를 시트가 아니라 지도 영역 상단에 고정.
// 시트 스냅(peek/half/full)과 무관하게 검색 입력이 항상 보여 위시 저장 ≤3탭 흐름을 보존(ux §3).
export function MapSearchOverlay({ coupleId }: { coupleId: string | null }) {
  return (
    <div className={styles.overlay} data-search-overlay="true">
      <PlaceSearch coupleId={coupleId} />
    </div>
  )
}
