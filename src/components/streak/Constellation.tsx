import { STARS_PER_WEEK, constellationOf, hashKey, type StarOwner } from '@/lib/streak/garden'
import styles from './Constellation.module.css'

// 이번 주의 별자리 — 완료 1건이 별 하나, 7개면 선이 다 이어져 완성된다.
//
// 모양은 주 키에서 도출한다(저장 없음): 같은 주는 언제 열어도 같은 별자리·같은 이름이다.
// 별은 색만으로 구분하지 않는다(§8) — 주인마다 색이 다르되, 아직 안 찍힌 자리는
// '희미한 십자 표식'이라는 모양으로 구분되고 개수는 글자로도 나온다.

const VB = { w: 100, h: 68 }

const OWNER_VAR: Record<StarOwner, string> = {
  mine: 'var(--c-track-mine)',
  partner: 'var(--c-track-partner)',
  shared: 'var(--c-track-shared)',
}

// 반짝이는 4각 별 — 오목한 곡선이라 작게 그려도 '별'로 읽힌다.
// (5각 폴리곤은 10px 아래에서 뭉개져 그냥 얼룩이 된다.)
const SPARKLE =
  'M0,-10 C1.1,-3.6 3.6,-1.1 10,0 C3.6,1.1 1.1,3.6 0,10 C-1.1,3.6 -3.6,1.1 -10,0 C-3.6,-1.1 -1.1,-3.6 0,-10 Z'

/** 배경의 성긴 별먼지 — 주 키에서 도출해 매주 다른 하늘이 되지만 새로고침엔 안 흔들린다. */
function dust(seedKey: string): { x: number; y: number; r: number; o: number }[] {
  let h = hashKey(seedKey) || 1
  const next = () => {
    // xorshift — Math.random 없이 결정론적으로.
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return ((h >>> 0) % 10000) / 10000
  }
  return Array.from({ length: 26 }, () => ({
    x: next() * VB.w,
    y: next() * VB.h,
    r: 0.25 + next() * 0.5,
    o: 0.25 + next() * 0.5,
  }))
}

export function Constellation({
  mondayKey,
  stars,
  compact = false,
  targetId,
}: {
  mondayKey: string
  stars: readonly StarOwner[]
  /** 접힌 줄용 — 빈 자리와 별먼지를 빼고 찍힌 별만 조용히 보여준다. */
  compact?: boolean
  /** 완료 시 별이 날아와 박힐 지점(펼침 버전에만 준다). */
  targetId?: string
}) {
  const shape = constellationOf(mondayKey)
  const filled = Math.min(stars.length, STARS_PER_WEEK)
  const complete = filled >= STARS_PER_WEEK
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
      {/* 별먼지 — 별자리가 '하늘 위에' 있다고 읽히게 하는 배경. 접힌 줄에선 생략. */}
      {!compact ? (
        <g className={styles.dust} aria-hidden>
          {dust(mondayKey).map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} opacity={d.o} />
          ))}
        </g>
      ) : null}

      {/* 이어진 선 — 찍힌 별들 사이만. 완성되면 마지막 별에서 처음으로 닫힌다. */}
      {shape.points.map((pt, i) => {
        const prev = shape.points[i - 1]
        if (!prev || i >= filled) return null
        return (
          <line key={`l${i}`} className={styles.link} x1={prev[0]} y1={prev[1]} x2={pt[0]} y2={pt[1]} />
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
          // 아직 안 찍힌 자리 — 색이 아니라 '희미한 십자 표식'이라는 모양으로 구분된다(§8).
          return compact ? null : (
            <g key={`e${i}`} className={styles.empty} aria-hidden>
              <line x1={pt[0] - 2} y1={pt[1]} x2={pt[0] + 2} y2={pt[1]} />
              <line x1={pt[0]} y1={pt[1] - 2} x2={pt[0]} y2={pt[1] + 2} />
            </g>
          )
        }
        // 크기를 조금씩 다르게 — 다 같은 크기면 도표처럼 보인다. 자리 index에서 도출(안 흔들림).
        const scale = 0.34 + ((hashKey(`${mondayKey}:${i}`) % 5) / 5) * 0.16
        return (
          <g
            key={`s${i}`}
            className={styles.star}
            style={{
              color: OWNER_VAR[owner],
              // 반짝임을 별마다 어긋나게 — 동시에 깜빡이면 기계처럼 보인다.
              animationDelay: `${(hashKey(`${mondayKey}:d${i}`) % 20) * 0.17}s`,
            }}
          >
            <circle className={styles.halo} cx={pt[0]} cy={pt[1]} r={4.5} />
            <path
              className={styles.spark}
              d={SPARKLE}
              transform={`translate(${pt[0]} ${pt[1]}) scale(${scale})`}
            />
          </g>
        )
      })}

      {/* 날아온 별이 박히는 지점 — 화면 좌표를 읽어야 해서 실제 노드가 필요하다. */}
      {targetId ? <circle id={targetId} className={styles.anchor} cx={next[0]} cy={next[1]} r={1} /> : null}
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
          <path className={styles.glyphStar} d={SPARKLE} transform="translate(12 12) rotate(90) scale(0.62)" />
        ) : null}
      </svg>
    </span>
  )
}
