import { useKakaoSearch } from '@/hooks/useKakaoSearch'
import type { KakaoPlaceHit } from '@/lib/kakao/types'
import styles from './PlaceSearch.module.css'

// 장소 검색창 + 후보 목록(§5.2). 입력 → 디바운스 자동완성 → 결과 탭하면 onPick(hit)을 부모로 위임.
// 저장은 더 이상 여기서 즉시 하지 않는다(spec §3.6): 부모(MapPage)가 저장됨이면 선택, 미저장이면 프리뷰.
export function PlaceSearch({
  coupleId,
  savedKakaoIds,
  onPick,
}: {
  coupleId: string | null
  savedKakaoIds: Set<string>
  onPick: (hit: KakaoPlaceHit) => void
}) {
  const { query, setQuery, clear, status, hits, error } = useKakaoSearch()
  void coupleId // coupleId는 부모 저장 흐름에서 사용(여기선 표식만 유지).

  return (
    <div className={styles.wrap} data-testid="place-search">
      <div className={styles.searchRow}>
        <input
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
                  onClick={() => onPick(hit)}
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
