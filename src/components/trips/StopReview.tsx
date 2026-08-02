import { useState } from 'react'
import { SourceAvatar } from '@/components/common/SourceAvatar'
import type { VisitRow } from '@/hooks/useVisits'
import type { ProfileMap } from '@/hooks/useProfiles'
import styles from './StopReview.module.css'

// 다녀온 장소의 리뷰 — 별점 + 한 줄. 지난 날의 스톱에만 붙는다.
//
// 스키마를 늘리지 않는다(CLAUDE.md §7): 리뷰 = 내 visits 행의 rating/memo다.
// visits에 유니크 제약이 없으므로 둘이 각각 자기 행을 남긴다(created_by로 갈림) —
// 한 칸을 같이 쓰면 나중에 쓴 사람이 상대 글을 덮는다. 각자의 것이라 덮을 일이 없다.
//
// 별점은 색·모양만으로 말하지 않는다(§8) — '5점 중 3점' 라벨과 "3/5" 텍스트를 함께 둔다.

const MAX = 5

function Stars({ value }: { value: number }) {
  return (
    <span className={styles.starsRead}>
      <span aria-hidden>{'★'.repeat(value)}{'☆'.repeat(MAX - value)}</span>
      <span className={styles.score}>
        {value}/{MAX}
      </span>
    </span>
  )
}

export function StopReview({
  placeId,
  placeName,
  visits,
  myId,
  profiles,
  busy,
  onSave,
}: {
  placeId: string
  placeName: string
  /** 이 장소의 살아있는 방문행 전부(둘 것 모두). */
  visits: readonly VisitRow[]
  myId: string | null
  profiles: ProfileMap
  busy: boolean
  onSave: (v: { placeId: string; rating: number | null; memo: string | null }) => void
}) {
  const mine = visits.find((v) => v.created_by === myId) ?? null
  const theirs = visits.filter((v) => v.created_by !== myId && (v.rating != null || v.memo))

  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState<number>(mine?.rating ?? 0)
  const [memo, setMemo] = useState<string>(mine?.memo ?? '')

  const hasMine = mine != null && (mine.rating != null || Boolean(mine.memo))

  const start = () => {
    setRating(mine?.rating ?? 0)
    setMemo(mine?.memo ?? '')
    setOpen(true)
  }

  const save = () => {
    onSave({
      placeId,
      rating: rating > 0 ? rating : null,
      memo: memo.trim() ? memo.trim() : null,
    })
    setOpen(false)
  }

  return (
    <div className={styles.wrap}>
      {/* 상대 리뷰는 읽기 전용 — 고쳐 쓰는 건 각자 자기 것만(§4.2와 같은 결). */}
      {theirs.map((v) => (
        <p key={v.id} className={styles.read}>
          <SourceAvatar userId={v.created_by} profiles={profiles} myId={myId} context=" 리뷰" />
          {v.rating != null ? <Stars value={v.rating} /> : null}
          {v.memo ? <span className={styles.memo}>{v.memo}</span> : null}
        </p>
      ))}

      {open ? (
        <div className={styles.form}>
          <div className={styles.stars} role="radiogroup" aria-label={`${placeName} 별점`}>
            {Array.from({ length: MAX }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${MAX}점 중 ${n}점`}
                className={n <= rating ? `${styles.star} ${styles.starOn}` : styles.star}
                onClick={() => setRating(rating === n ? 0 : n)}
              >
                {n <= rating ? '★' : '☆'}
              </button>
            ))}
            <span className={styles.score}>
              {rating > 0 ? `${rating}/${MAX}` : '별점 없음'}
            </span>
          </div>
          <input
            className={styles.input}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="어땠어요?"
            aria-label={`${placeName} 리뷰 한 줄`}
            maxLength={200}
          />
          <div className={styles.actions}>
            <button type="button" className={styles.save} onClick={save} disabled={busy}>
              저장
            </button>
            <button type="button" className={styles.cancel} onClick={() => setOpen(false)}>
              취소
            </button>
          </div>
        </div>
      ) : hasMine ? (
        <p className={styles.read}>
          <SourceAvatar userId={myId ?? ''} profiles={profiles} myId={myId} context=" 리뷰" />
          {mine?.rating != null ? <Stars value={mine.rating} /> : null}
          {mine?.memo ? <span className={styles.memo}>{mine.memo}</span> : null}
          <button type="button" className={styles.edit} onClick={start}>
            고치기
          </button>
        </p>
      ) : (
        <button
          type="button"
          className={styles.cta}
          onClick={start}
          aria-label={`${placeName} 리뷰 남기기`}
        >
          리뷰 남기기
        </button>
      )}
    </div>
  )
}
