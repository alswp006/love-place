import { useState } from 'react'
import { useKakaoSearch } from '@/hooks/useKakaoSearch'
import { useSavePlace } from '@/hooks/useSavePlace'
import type { KakaoPlaceHit } from '@/lib/kakao/types'
import styles from './PlaceSearch.module.css'

// 장소 검색창 + 후보 목록(§5.2). 입력 → 디바운스 자동완성 → 탭하면 저장(≤3탭).
export function PlaceSearch({ coupleId }: { coupleId: string | null }) {
  const { query, setQuery, clear, status, hits, error } = useKakaoSearch()
  const save = useSavePlace(coupleId)
  const [toast, setToast] = useState<string | null>(null)

  const onPick = (hit: KakaoPlaceHit) => {
    save.mutate(hit, {
      onSuccess: (r) => {
        setToast(r.jumped ? `이미 담은 곳이에요 — 찜에 추가했어요` : `'${hit.name}' 저장!`)
        clear()
        setTimeout(() => setToast(null), 2000)
      },
      onError: (e) => {
        setToast(e.message)
        setTimeout(() => setToast(null), 3000)
      },
    })
  }

  return (
    <div className={styles.wrap}>
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
          {hits.map((hit) => (
            <li key={hit.kakaoPlaceId}>
              <button
                className={styles.resultItem}
                onClick={() => onPick(hit)}
                disabled={save.isPending}
              >
                <span className={styles.name}>{hit.name}</span>
                <span className={styles.addr}>{hit.address}</span>
                {hit.category ? <span className={styles.cat}>{hit.category}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {toast ? (
        <div className={styles.toast} role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </div>
  )
}
