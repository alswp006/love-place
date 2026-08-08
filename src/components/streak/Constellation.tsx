import { STARS_PER_WEEK, constellationOf, type StarOwner } from '@/lib/streak/garden'
import styles from './Constellation.module.css'

// 이번 주의 별자리 — 완료 1건이 별 하나, 7개면 선이 다 이어져 완성된다.
//
// 모양은 주 키에서 도출한다(저장 없음): 같은 주는 언제 열어도 같은 별자리·같은 이름이다.
// 별은 색만으로 구분하지 않는다(§8) — 주인마다 색이 다르되, 아직 안 찍힌 자리는
// '빈 고리'라는 모양으로 구분되고 개수는 글자로도 나온다.

const VB = { w: 100, h: 68 }

const OWNER_VAR: Record<StarOwner, string> = {
  mine: 'var(--c-track-mine)',
  partner: 'var(--c-track-partner)',
  shared: 'var(--c-track-shared)',
}

export function Constellation({
  mondayKey,
  stars,
  compact = false,
  targetId,
}: {
  mondayKey: string
  stars: readonly StarOwner[]
  /** 접힌 줄용 — 빈 자리와 이름표를 빼고 찍힌 별만 조용히 보여준다. */
  compact?: boolean
  /** 완료 시 별이 날아와 박힐 지점(펼침 버전에만 준다). */
  targetId?: string
}) {
  const shape = constellationOf(mondayKey)
  const filled = Math.min(stars.length, STARS_PER_WEEK)
  const complete = filled >= STARS_PER_WEEK
  // 다음에 별이 박힐 자리 — 날아오는 별의 착지점.
  const nextIdx = Math.min(filled, STARS_PER_WEEK - 1)
  const next = shape.points[nextIdx]!

  return (
    <svg
      className={compact ? `${styles.svg} ${styles.compact}` : styles.svg}
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      role="img"
      aria-label={
        complete
          ? `이번 주 별자리 '${shape.name}' 완성 — 별 ${stars.length}개`
          : `이번 주 별 ${filled}개, ${STARS_PER_WEEK - filled}개 더 모으면 '${shape.name}' 완성`
      }
    >
      {/* 이어진 선 — 찍힌 별들 사이만. 완성되면 마지막 별에서 처음으로 닫힌다. */}
      {shape.points.map((pt, i) => {
        const prev = shape.points[i - 1]
        if (!prev || i >= filled) return null
        return (
          <line
            key={`l${i}`}
            className={styles.link}
            x1={prev[0]}
            y1={prev[1]}
            x2={pt[0]}
            y2={pt[1]}
          />
        )
      })}
      {complete ? (
        <line
          className={`${styles.link} ${styles.linkClose}`}
          x1={shape.points[STARS_PER_WEEK - 1]![0]}
          y1={shape.points[STARS_PER_WEEK - 1]![1]}
          x2={shape.points[0]![0]}
          y2={shape.points[0]![1]}
        />
      ) : null}

      {shape.points.map((pt, i) => {
        const owner = stars[i]
        if (!owner) {
          // 아직 안 찍힌 자리 — 색이 아니라 '빈 고리'라는 모양으로 구분된다(§8).
          return compact ? null : (
            <circle key={`e${i}`} className={styles.empty} cx={pt[0]} cy={pt[1]} r={2.2} />
          )
        }
        return (
          <g key={`s${i}`} className={styles.star} style={{ color: OWNER_VAR[owner] }}>
            <circle className={styles.glow} cx={pt[0]} cy={pt[1]} r={5} />
            <circle className={styles.core} cx={pt[0]} cy={pt[1]} r={2.6} />
          </g>
        )
      })}

      {/* 날아온 별이 박히는 지점 — 화면 좌표를 읽어야 해서 실제 노드가 필요하다. */}
      {targetId ? (
        <circle id={targetId} className={styles.anchor} cx={next[0]} cy={next[1]} r={1} />
      ) : null}
    </svg>
  )
}

/** 지난 주 하나를 나타내는 작은 글리프 — 완성이면 채운 별, 아니면 채운 만큼의 고리. */
export function WeekGlyph({
  mondayKey,
  filled,
  complete,
}: {
  mondayKey: string
  filled: number
  complete: boolean
}) {
  const shape = constellationOf(mondayKey)
  const pct = Math.min(filled / STARS_PER_WEEK, 1)
  return (
    <span
      className={styles.glyph}
      title={`${mondayKey} 주 · 별 ${filled}/${STARS_PER_WEEK}${complete ? ` · ${shape.name}` : ''}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden className={styles.glyphSvg}>
        <circle className={styles.glyphTrack} cx="12" cy="12" r="9" />
        {/* 채운 만큼의 호 — 색이 아니라 길이로 읽힌다. */}
        <circle
          className={styles.glyphFill}
          cx="12"
          cy="12"
          r="9"
          pathLength={100}
          strokeDasharray={`${pct * 100} 100`}
        />
        {complete ? (
          <path
            className={styles.glyphStar}
            d="M12 6.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z"
          />
        ) : null}
      </svg>
    </span>
  )
}
