import { PlaceSearch } from '@/components/places/PlaceSearch'
import type { KakaoPlaceHit } from '@/lib/kakao/types'
import styles from './MapSearchOverlay.module.css'

// 지도 위 상단 검색 오버레이(spec §5) — PlaceSearch를 시트가 아니라 지도 영역 상단에 고정.
// savedKakaoIds/onPick을 그대로 PlaceSearch로 전달(저장됨 표시 + 프리뷰/선택 위임, spec §3.6).
export function MapSearchOverlay({
  coupleId,
  savedKakaoIds,
  onPick,
}: {
  coupleId: string | null
  savedKakaoIds: Set<string>
  onPick: (hit: KakaoPlaceHit) => void
}) {
  return (
    <div className={styles.overlay} data-search-overlay="true">
      <PlaceSearch coupleId={coupleId} savedKakaoIds={savedKakaoIds} onPick={onPick} />
    </div>
  )
}
