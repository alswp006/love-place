import { TRACK_META, type Track } from '@/lib/calendar/track'
import type { ProfileMap } from '@/hooks/useProfiles'
import styles from './TrackBadge.module.css'

// 트랙 표시 — 아바타 + 이름.
//
// ●▲■ 도형을 걷어낸 이유: 그 도형은 '색만으로 구분 금지'(§8)를 가장 게으르게 푼 결과였는데,
// 옆에 '함께'라는 **글자가 이미 있어서** 규칙은 그 라벨만으로 충족돼 있었다. 도형은 중복이었고
// 화면을 사양서처럼 보이게 했다.
//
// 대신 아바타를 쓴다: 둘이 쓰는 앱에서 "누구 것인가"는 얼굴로 읽는 게 가장 빠르고,
// 색·모양·글자가 한 번에 붙어 접근성 이중화도 그대로다.
//   나/상대 = 그 사람 아바타 하나 · 함께 = 두 아바타를 겹쳐 하나의 표식으로.

export function TrackBadge({
  track,
  profiles,
  myId,
  /** 이름을 감춘다 — 좁은 칩(월 셀 등)에서 아바타만 쓸 때. 접근 이름은 aria-label로 남는다. */
  compact = false,
  className,
}: {
  track: Track
  profiles: ProfileMap
  myId: string | null
  compact?: boolean
  className?: string
}) {
  const meta = TRACK_META[track]
  const partnerId = Object.keys(profiles).find((id) => id !== myId) ?? null
  const ids: (string | null)[] =
    track === 'shared' ? [myId, partnerId] : track === 'mine' ? [myId] : [partnerId]

  const cls = [styles.badge, compact ? styles.compact : '', className].filter(Boolean).join(' ')
  return (
    <span className={cls} aria-label={compact ? meta.label : undefined}>
      <span className={styles.faces} aria-hidden>
        {ids.map((id, i) => {
          const p = id ? profiles[id] : undefined
          const name = p?.displayName?.trim() || (i === 0 && track !== 'partner' ? '나' : '상대')
          return (
            <span
              key={`${id ?? 'x'}-${i}`}
              className={styles.face}
              style={{ backgroundColor: p?.color ?? meta.cssVar }}
            >
              {p?.avatarUrl ? (
                <img src={p.avatarUrl} alt="" className={styles.img} />
              ) : (
                name.slice(0, 1).toUpperCase()
              )}
            </span>
          )
        })}
      </span>
      {compact ? null : <span className={styles.label}>{meta.label}</span>}
    </span>
  )
}
