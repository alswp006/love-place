import { useEffect, useRef } from 'react'
import { markerVisual } from '@/lib/places/markerVisual'
import type { WithWish } from '@/lib/places/wishStatus'
import type { PlaceRow } from '@/hooks/usePlaces'
import type { CollectionRow } from '@/hooks/useCollections'
import styles from './PlaceDetail.module.css'

// 선택된 저장 장소의 상세(말풍선→시트 React 전환, spec §2/§3.6). 이름·상태(글리프+텍스트)·
// 카테고리/지역 + 액션(가봤어요 토글 · ❤️ 리액션 · 닫기). 길찾기 없음(#5). 포커스 이동 + aria-live.
// 컬렉션(저장 목록) props는 선택 — 주어지면 "목록" 섹션으로 이 장소의 목록 소속을 토글한다(가산 기능).
export function PlaceDetail({
  place, visited, didIReact, reactionCount, busy,
  onVisit, onUnvisit, onReact, onClose,
  collections, memberCollIds, onToggleCollection, onManageCollections,
}: {
  place: WithWish<PlaceRow>
  visited: boolean
  didIReact: boolean
  reactionCount: number
  busy: boolean
  onVisit: () => void
  onUnvisit: () => void
  onReact: () => void
  onClose: () => void
  collections?: CollectionRow[]
  memberCollIds?: Set<string>
  onToggleCollection?: (collectionId: string) => void
  onManageCollections?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [place.id])
  const visual = markerVisual({ visited, bothWished: place.wish.bothWished, name: place.name })
  const statusText = visual.kind === 'visited' ? '가봤음' : visual.kind === 'both' ? '둘 다 찜' : '가고싶음'
  const meta = [place.category, place.region_label].filter((x): x is string => Boolean(x)).join(' · ')
  const heart = didIReact ? '❤️' : '🤍'
  return (
    <div ref={ref} className={styles.detail} tabIndex={-1} aria-label="장소 상세" aria-live="polite">
      <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">
        ✕
      </button>
      <div className={styles.head}>
        <span className={styles.glyph} aria-hidden>{visual.glyph}</span>
        <span className={styles.name}>{place.name}</span>
      </div>
      <div className={styles.sub}>
        <span className={styles.status}>{statusText}</span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </div>
      <div className={styles.actions}>
        {visited ? (
          <button
            type="button"
            className={`${styles.action} ${styles.actionDone}`}
            onClick={onUnvisit}
            disabled={busy}
            aria-pressed={true}
            aria-label={`${place.name} 가봤음 기록 취소`}
          >
            ✅ 가봤음 (취소)
          </button>
        ) : (
          <button
            type="button"
            className={styles.action}
            onClick={onVisit}
            disabled={busy}
            aria-pressed={false}
            aria-label={`${place.name} 다녀왔어요`}
          >
            ✅ 다녀왔어요
          </button>
        )}
        <button
          type="button"
          className={styles.action}
          onClick={onReact}
          disabled={busy}
          aria-pressed={didIReact}
          aria-label={`${place.name} 하트 리액션 (총 ${reactionCount}개)`}
        >
          {heart}{reactionCount > 0 ? ` ${reactionCount}` : ''}
        </button>
      </div>

      {onToggleCollection ? (
        // 목록(컬렉션) 토글 — 색만 의존 금지: ✓/+ 글리프 + 텍스트 + aria-pressed로 소속 이중 표시(§8).
        <div className={styles.collSection}>
          <span className={styles.collLabel}>목록</span>
          <div className={styles.collChips} role="group" aria-label={`${place.name} 목록`}>
            {(collections ?? []).map((c) => {
              const inIt = memberCollIds?.has(c.id) ?? false
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`${styles.collChip} ${inIt ? styles.collOn : ''}`}
                  aria-pressed={inIt}
                  aria-label={`${c.name}${inIt ? ' 목록에서 빼기' : ' 목록에 담기'}`}
                  disabled={busy}
                  onClick={() => onToggleCollection(c.id)}
                >
                  {inIt ? '✓ ' : '+ '}
                  {c.name}
                </button>
              )
            })}
            {onManageCollections ? (
              <button
                type="button"
                className={styles.collManage}
                onClick={onManageCollections}
                aria-label="목록 관리"
              >
                ＋ 목록
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
