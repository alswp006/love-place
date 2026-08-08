import { useEffect, useRef } from 'react'
import { Icon } from '@/components/ui/Icon'
import { markerVisual } from '@/lib/places/markerVisual'
import type { WithWish } from '@/lib/places/wishStatus'
import type { PlaceRow } from '@/hooks/usePlaces'
import type { CollectionRow } from '@/hooks/useCollections'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PhotoThumb } from '@/components/photos/PhotoThumb'
import { PhotoPicker } from '@/components/photos/PhotoPicker'
import { Chip } from '@/components/ui/Chip'
import { LikeButton } from '@/components/ui/LikeButton'
import styles from './PlaceDetail.module.css'

// 선택된 저장 장소의 상세(말풍선→시트 React 전환, spec §2/§3.6). 이름·상태(글리프+텍스트)·
// 카테고리/지역 + 액션(가봤어요 토글 · ❤️ 리액션 · 닫기). 길찾기 없음(#5). 포커스 이동 + aria-live.
// 컬렉션(저장 목록) props는 선택 — 주어지면 "목록" 섹션으로 이 장소의 목록 소속을 토글한다(가산 기능).
export function PlaceDetail({
  place, visited, didIReact, reactionCount, reactionState, busy,
  onVisit, onUnvisit, onReact, onClose,
  collections, memberCollIds, onToggleCollection, onManageCollections,
  coupleId, myId, photos, photoUrls,
}: {
  place: WithWish<PlaceRow>
  visited: boolean
  didIReact: boolean
  reactionCount: number
  /** "상대가 하트를 눌렀어요" 같은 상태 문장(aggregateReactions.reactionLabel). 숫자만으론 누가 눌렀는지 못 읽는다. */
  reactionState?: string
  busy: boolean
  onVisit: () => void
  onUnvisit: () => void
  onReact: () => void
  onClose: () => void
  collections?: CollectionRow[]
  memberCollIds?: Set<string>
  onToggleCollection?: (collectionId: string) => void
  /** 사진(§5.4) — 이 장소에 붙은 것들. 없으면 슬롯 자체를 안 그린다(회색 박스 금지). */
  coupleId?: string | null
  myId?: string | null
  photos?: { id: string; storage_url: string; thumbnail_url: string | null }[]
  photoUrls?: Record<string, string>
  onManageCollections?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [place.id])
  const visual = markerVisual({ visited, bothWished: place.wish.bothWished, name: place.name })
  const statusText = visual.kind === 'visited' ? '가봤음' : visual.kind === 'both' ? '둘 다 찜' : '가고싶음'
  // 상태 칩 톤은 색만으로 구분하지 않는다(글리프 + 텍스트 병기, §8). 가봤음=ok, 그 외=핑크.
  const statusTone = visual.kind === 'visited' ? 'ok' : 'pink'
  const meta = [place.category, place.region_label].filter((x): x is string => Boolean(x)).join(' · ')
  return (
    <Card ref={ref} className={styles.detail} tabIndex={-1} aria-label="장소 상세" aria-live="polite">
      <Button variant="ghost" className={styles.close} onClick={onClose} aria-label="닫기">
        <span aria-hidden>✕</span>
      </Button>
      <div className={styles.head}>
        <span className={styles.glyph} aria-hidden>{visual.glyph}</span>
        <span className={styles.name}>{place.name}</span>
      </div>
      <div className={styles.sub}>
        <Chip tone={statusTone}>
          <span aria-hidden>{visual.glyph}</span>
          {statusText}
        </Chip>
        {meta ? <Chip tone="neutral" className={styles.meta}>{meta}</Chip> : null}
      </div>
      <div className={styles.actions}>
        {visited ? (
          <Button
            variant="ghost"
            className={styles.action}
            onClick={onUnvisit}
            disabled={busy}
            aria-pressed={true}
            aria-label={`${place.name} 가봤음 기록 취소`}
          >
            <Icon name="check-circle" /> 가봤음 (취소)
          </Button>
        ) : (
          <Button
            variant="primary"
            className={styles.action}
            onClick={onVisit}
            disabled={busy}
            aria-pressed={false}
            aria-label={`${place.name} 다녀왔어요`}
          >
            <Icon name="check-circle" /> 다녀왔어요
          </Button>
        )}
        <LikeButton
          className={styles.react}
          liked={didIReact}
          count={reactionCount}
          onToggle={onReact}
          disabled={busy}
          label={`${place.name} — ${reactionState ?? `하트 리액션 (총 ${reactionCount}개)`}`}
        />
        {/* 숫자만 조용히 +1 되는 대신, 누가 눌렀는지 텍스트로 말한다(ux §2 "함께 하는 신호"). */}
        {reactionState && reactionCount > 0 ? (
          <span className={styles.reactState}>{reactionState}</span>
        ) : null}
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
                  <span aria-hidden>{inIt ? '✓ ' : '+ '}</span>
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
                <span aria-hidden>＋</span> 목록
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 사진(§5.4) — 이 앱은 여행 기록이다. 사진이 붙어야 목록이 '조회 결과'가 아니게 된다.
          없을 땐 그리드를 그리지 않고 담기 버튼만 둔다(회색 플레이스홀더 금지). */}
      {coupleId ? (
        <div className={styles.photos}>
          {photos && photos.length > 0 ? (
            <ul className={styles.photoGrid} aria-label={`${place.name} 사진`}>
              {photos.map((ph) => {
                const url = photoUrls?.[ph.thumbnail_url ?? ph.storage_url]
                if (!url) return null
                return (
                  <li key={ph.id}>
                    <PhotoThumb url={url} alt="" className={styles.photoCell} />
                  </li>
                )
              })}
            </ul>
          ) : null}
          <PhotoPicker coupleId={coupleId} myId={myId ?? null} placeId={place.id} />
        </div>
      ) : null}
    </Card>
  )
}
