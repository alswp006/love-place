import { constellationOfWeek, type ConstellationDef } from '@/lib/streak/constellations'
import type { StarEntry, StarOwner } from '@/lib/streak/garden'
import styles from './Constellation.module.css'

// 이번 주의 별자리 — 완료 1건이 별 하나, 그 별자리의 별을 다 채우면 완성된다.
//
// 모양·이름은 지어내지 않는다: 그 달에 실제로 보이는 별자리에서 온다(constellations.ts).
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

/** 문자열 → 안정 해시(별 크기·반짝임 타이밍을 어긋나게 하는 데만 쓴다). */
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

/** 배경의 성긴 별먼지 — 주 키에서 도출해 매주 다른 하늘이 되지만 새로고침엔 안 흔들린다. */
function dust(seedKey: string): { x: number; y: number; r: number; o: number }[] {
  let h = hash(seedKey) || 1
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
  labelOf,
  compact = false,
  targetId,
}: {
  mondayKey: string
  stars: readonly StarEntry[]
  /** 별 하나가 무슨 일정이었는지 — 눌러(또는 스크린리더로) 되짚을 수 있게. */
  labelOf?: (star: StarEntry) => string
  /** 접힌 줄용 — 빈 자리와 별먼지를 빼고 찍힌 별만 조용히 보여준다. */
  compact?: boolean
  /** 완료 시 별이 날아와 박힐 지점(펼침 버전에만 준다). */
  targetId?: string
}) {
  const shape: ConstellationDef = constellationOfWeek(mondayKey)
  const need = shape.points.length
  const filled = Math.min(stars.length, need)
  const complete = filled >= need
  const nextIdx = Math.min(filled, need - 1)
  const next = shape.points[nextIdx]!

  return (
    <svg
      className={compact ? `${styles.svg} ${styles.compact}` : styles.svg}
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      role="img"
      aria-label={
        complete
          ? `이번 주 ${shape.name} 완성 — 별 ${stars.length}개`
          : `이번 주 별 ${filled}개, ${need - filled}개 더 모으면 ${shape.name} 완성`
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

      {/* 이어진 선 — 별자리마다 잇는 방식이 다르므로 정의된 edge만 그린다.
          (폴리라인으로 뭉뚱그리면 북두칠성 바가지가 안 닫히고 손잡이가 닫힌다.) */}
      {shape.edges.map(([a, b], i) => {
        if (a >= filled || b >= filled) return null
        const p = shape.points[a]!
        const q = shape.points[b]!
        return (
          <line
            key={`l${i}`}
            className={complete ? `${styles.link} ${styles.linkDone}` : styles.link}
            x1={p[0]}
            y1={p[1]}
            x2={q[0]}
            y2={q[1]}
          />
        )
      })}

      {shape.points.map((pt, i) => {
        const star = stars[i]
        if (!star) {
          // 아직 안 찍힌 자리 — 색이 아니라 '희미한 십자 표식'이라는 모양으로 구분된다(§8).
          return compact ? null : (
            <g key={`e${i}`} className={styles.empty} aria-hidden>
              <line x1={pt[0] - 2} y1={pt[1]} x2={pt[0] + 2} y2={pt[1]} />
              <line x1={pt[0]} y1={pt[1] - 2} x2={pt[0]} y2={pt[1] + 2} />
            </g>
          )
        }
        // 크기를 조금씩 다르게 — 다 같으면 도표처럼 보인다. 자리에서 도출(안 흔들림).
        const scale = 0.34 + ((hash(`${mondayKey}:${i}`) % 5) / 5) * 0.16
        const label = labelOf?.(star)
        return (
          <g
            key={`s${i}`}
            className={styles.star}
            style={{
              color: OWNER_VAR[star.owner],
              // 반짝임을 별마다 어긋나게 — 동시에 깜빡이면 기계처럼 보인다.
              animationDelay: `${(hash(`${mondayKey}:d${i}`) % 20) * 0.17}s`,
            }}
          >
            {label ? <title>{label}</title> : null}
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
  needed,
  complete,
}: {
  mondayKey: string
  filled: number
  needed: number
  complete: boolean
}) {
  const shape = constellationOfWeek(mondayKey)
  const pct = Math.min(filled / Math.max(needed, 1), 1)
  return (
    <span
      className={styles.glyph}
      title={`${mondayKey} 주 · ${shape.name} ${filled}/${needed}${complete ? ' 완성' : ''}`}
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
