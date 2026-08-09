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
  // 상대가 없으면(혼자 쓰는 중) '함께'가 유령 아바타 하나를 더 그렸다 — 프로필이 없어
  // '상대'라는 글자만 뜬 회색 원. 없는 사람을 그리지 않는다(0024).
  //
  // 단 **라벨은 절대 지우지 않는다.** 아바타는 장식이고 이름이 본체다. 아바타 유무로 배지를
  // 통째로 없앴더니, profiles가 아직 안 온 순간에 트랙 전환 버튼이 빈 칸이 됐다(§8 색+라벨).
  const ids: string[] = (
    track === 'shared' ? [myId, partnerId] : track === 'mine' ? [myId] : [partnerId]
  ).filter((id): id is string => Boolean(id))

  const cls = [styles.badge, compact ? styles.compact : '', className].filter(Boolean).join(' ')
  return (
    <span className={cls} aria-label={compact ? meta.label : undefined}>
      {ids.length > 0 ? (
        <span className={styles.faces} aria-hidden>
          {ids.map((id, i) => {
            const p = id ? profiles[id] : undefined
            const name = p?.displayName?.trim() || (id === myId ? '나' : '상대')
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
      ) : null}
      {compact ? null : <span className={styles.label}>{meta.label}</span>}
    </span>
  )
}
