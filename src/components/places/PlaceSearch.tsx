import { useRef, useEffect } from 'react'
import { useKakaoSearch } from '@/hooks/useKakaoSearch'
import type { KakaoPlaceHit } from '@/lib/kakao/types'
import styles from './PlaceSearch.module.css'

// 장소 검색창 + 후보 목록(§5.2). 입력 → 디바운스 자동완성 → 결과 탭하면 onPick(hit)을 부모로 위임.
// 저장은 더 이상 여기서 즉시 하지 않는다(spec §3.6): 부모(MapPage)가 저장됨이면 선택, 미저장이면 프리뷰.
export function PlaceSearch({
  coupleId,
  savedKakaoIds,
  onPick,
  initialQuery,
  onActiveChange,
}: {
  coupleId: string | null
  savedKakaoIds: Set<string>
  onPick: (hit: KakaoPlaceHit) => void
  initialQuery?: string | null
  /** 검색을 시작/끝냈다 — 부모가 겹치는 오버레이(알림 줄)를 치우는 데 쓴다. */
  onActiveChange?: (active: boolean) => void
}) {
  const { query, setQuery, clear, status, hits, error } = useKakaoSearch()
  const inputRef = useRef<HTMLInputElement>(null)
  // 검색어가 있으면 그 아래로 결과가 펼쳐진다 — 같은 자리에 있는 알림 줄과 겹치므로 부모에 알린다.
  const active = query.trim().length > 0
  useEffect(() => {
    onActiveChange?.(active)
  }, [active, onActiveChange])
  void coupleId // coupleId는 부모 저장 흐름에서 사용(여기선 표식만 유지).
  // 추천 SEED 카드의 ?q= 딥링크 — 최초 1회 검색어 시드 → 디바운스 자동완성 실행(빈 값 무시).
  const seeded = useRef(false)
  useEffect(() => {
    if (!seeded.current && initialQuery) {
      seeded.current = true
      setQuery(initialQuery)
    }
  }, [initialQuery, setQuery])

  return (
    <div className={styles.wrap} data-testid="place-search">
      <div className={styles.searchRow}>
        <input
          ref={inputRef}
          type="search"
          className={styles.input}
          placeholder="가고싶은 곳 검색 (예: 속초 칠성조선소)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="장소 검색"
          enterKeyHint="search"
        />
        {query ? (
          <button className={styles.clearBtn} onClick={clear} aria-label="검색어 지우기">
            ✕
          </button>
        ) : null}
      </div>

      {status === 'loading' ? (
        <p className={styles.hint} role="status">
          검색 중…
        </p>
      ) : null}
      {status === 'error' && error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {status === 'done' && hits.length === 0 ? (
        <p className={styles.hint}>검색 결과가 없어요. 다른 이름으로 찾아보세요.</p>
      ) : null}

      {hits.length > 0 ? (
        <ul className={styles.results}>
          {hits.map((hit) => {
            const saved = savedKakaoIds.has(hit.kakaoPlaceId)
            return (
              <li key={hit.kakaoPlaceId}>
                <button
                  className={styles.resultItem}
                  onClick={() => {
                    // 검색어·키보드를 유지한다 — 여행 계획 중엔 여러 곳을 몰아 담는 게 기본이라
                    // 한 곳 고를 때마다 지우면 다음 장소가 '입력 탭 + 재타이핑'부터 다시 시작한다.
                    // 특히 iOS Safari는 한 번 내려간 키보드를 사용자 탭 없이 못 올리므로
                    // blur()는 되돌릴 수 없는 비용이다. 목록 닫기는 부모의 상세 승격이 담당.
                    onPick(hit)
                  }}
                  aria-label={saved ? `${hit.name} (이미 저장됨) 지도에서 보기` : `${hit.name} 미리보기`}
                >
                  <span className={styles.name}>{hit.name}</span>
                  <span className={styles.addr}>{hit.address}</span>
                  {hit.category ? <span className={styles.cat}>{hit.category}</span> : null}
                  {saved ? (
                    // 저장됨 표시 — 색만이 아니라 ★ 아이콘 + "저장됨" 텍스트로 이중화(§8).
                    <span className={styles.savedTag}>★ 저장됨</span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
