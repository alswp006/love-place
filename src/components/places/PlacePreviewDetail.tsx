import { useEffect, useRef } from 'react'
import type { KakaoPlaceHit } from '@/lib/kakao/types'
import styles from './PlacePreviewDetail.module.css'

// 미저장 검색 후보의 시트 프리뷰(spec §3.6). 이름·카테고리·주소 + [저장]/[닫기]. 길찾기 없음(#5).
export function PlacePreviewDetail({
  hit, saving, onSave, onClose,
}: {
  hit: KakaoPlaceHit
  saving: boolean
  onSave: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [hit.kakaoPlaceId])
  const meta = [hit.category, hit.address].filter((x): x is string => Boolean(x)).join(' · ')
  return (
    <div ref={ref} className={styles.detail} tabIndex={-1} aria-label="검색 결과 미리보기" aria-live="polite">
      <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">✕</button>
      <div className={styles.head}>
        <span className={styles.glyph} aria-hidden>＋</span>
        <span className={styles.name}>{hit.name}</span>
      </div>
      {meta ? <div className={styles.sub}><span className={styles.meta}>{meta}</span></div> : null}
      <div className={styles.actions}>
        <button type="button" className={styles.save} onClick={onSave} disabled={saving} aria-label={`${hit.name} 저장`}>
          ⭐ 저장
        </button>
      </div>
    </div>
  )
}
