import { PlaceSearch } from '@/components/places/PlaceSearch'
import type { KakaoPlaceHit } from '@/lib/kakao/types'
import type { SnapStop } from '@/lib/places/sheetSnap'
import styles from './MapSearchOverlay.module.css'

// 지도 위 상단 검색 오버레이(spec §5) — PlaceSearch를 시트가 아니라 지도 영역 상단에 고정.
// savedKakaoIds/onPick을 그대로 PlaceSearch로 전달(저장됨 표시 + 프리뷰/선택 위임, spec §3.6).
// snap>peek면 접어 펼친 시트와 시각적으로 겹치지 않게 한다(spec §3.1).
export function MapSearchOverlay({
  coupleId,
  savedKakaoIds,
  onPick,
  snap,
  initialQuery,
  onActiveChange,
}: {
  coupleId: string | null
  savedKakaoIds: Set<string>
  onPick: (hit: KakaoPlaceHit) => void
  snap: SnapStop
  initialQuery?: string | null
  onActiveChange?: (active: boolean) => void
}) {
  // 시트가 half일 땐 검색창을 유지한다 — 예전엔 half만 돼도 숨어서, 상세가 자동 승격되는 순간
  // 검색창이 사라지고 목록은 "위 검색창에 장소 이름을 입력하면…"이라는 없는 UI를 가리켰다.
  // full(목록 전체 화면)에서만 접는다.
  const collapsed = snap === 'full'
  return (
    <div
      className={styles.overlay}
      data-search-overlay="true"
      data-testid="search-overlay"
      data-hidden={collapsed ? 'true' : undefined}
      aria-hidden={collapsed}
    >
      <PlaceSearch
        coupleId={coupleId}
        savedKakaoIds={savedKakaoIds}
        onPick={onPick}
        initialQuery={initialQuery}
        onActiveChange={onActiveChange}
      />
    </div>
  )
}
