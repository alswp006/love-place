import { useMemo } from 'react'
import {
  constellationOfMonth,
  starSlots,
  starsNeededForMonth,
  type ConstellationDef,
} from '@/lib/streak/constellations'
import type { StarEntry, StarOwner } from '@/lib/streak/garden'
import styles from './Constellation.module.css'

// 이번 달의 별자리 — 하루에 한 사람이 별 하나. 그 달의 날 수 × 2를 채우면 완성된다.
//
// 밝은 별(anchor)이 먼저 서고 나머지는 잇는 선 위에 채워진다. 그래서 초반에도 모양이 읽히고,
// 다 채우면 선 자체가 별로 이어진 그림이 된다.
//
// 색만으로 구분하지 않는다(§8) — 아직 안 찍힌 자리는 '희미한 십자/점'이라는 모양으로 갈리고
// 개수는 글자로도 나온다.

const VB = { w: 100, h: 68 }

const OWNER_VAR: Record<StarOwner, string> = {
  mine: 'var(--c-track-mine)',
  partner: 'var(--c-track-partner)',
}

// 반짝이는 4각 별 — 오목한 곡선이라 작게 그려도 '별'로 읽힌다.
const SPARKLE =
  'M0,-10 C1.1,-3.6 3.6,-1.1 10,0 C3.6,1.1 1.1,3.6 0,10 C-1.1,3.6 -3.6,1.1 -10,0 C-3.6,-1.1 -1.1,-3.6 0,-10 Z'

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

/** 배경의 성긴 별먼지 — 달 키에서 도출해 매달 다른 하늘이 되지만 새로고침엔 안 흔들린다. */
function dust(seedKey: string): { x: number; y: number; r: number; o: number }[] {
  let h = hash(seedKey) || 1
  const next = () => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return ((h >>> 0) % 10000) / 10000
  }
  return Array.from({ length: 26 }, () => ({
    x: next() * VB.w,
    y: next() * VB.h,
    r: 0.25 + next() * 0.5,
    o: 0.2 + next() * 0.4,
  }))
}

export function Constellation({
  monthKey,
  stars,
  labelOf,
  compact = false,
  targetId,
}: {
  monthKey: string
  stars: readonly StarEntry[]
  /** 별 하나가 무슨 일정이었는지 — 눌러(또는 스크린리더로) 되짚을 수 있게. */
  labelOf?: (star: StarEntry) => string
  /** 접힌 줄용 — 빈 자리와 별먼지를 빼고 찍힌 별만 조용히 보여준다. */
  compact?: boolean
  /** 완료 시 별이 날아와 박힐 지점(펼침 버전에만 준다). */
  targetId?: string
}) {
  const shape: ConstellationDef = constellationOfMonth(monthKey)
  const need = starsNeededForMonth(monthKey)
  const slots = useMemo(() => starSlots(shape, need), [shape, need])
  const filled = Math.min(stars.length, slots.length)
  const complete = filled >= slots.length
  const next = slots[Math.min(filled, slots.length - 1)]!

  return (
    <svg
      className={compact ? `${styles.svg} ${styles.compact}` : styles.svg}
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      role="img"
      aria-label={
        complete
          ? `이번 달 ${shape.name} 완성 — 별 ${filled}개`
          : `이번 달 ${shape.name} 별 ${filled}개, ${need - filled}개 남음`
      }
    >
      {/* 별먼지 — 별자리가 '하늘 위에' 있다고 읽히게 하는 배경. */}
      {!compact ? (
        <g className={styles.dust} aria-hidden>
          {dust(monthKey).map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} opacity={d.o} />
          ))}
        </g>
      ) : null}

      {/* 잇는 선 — 별자리마다 잇는 방식이 다르므로 정의된 edge만 그린다.
          채워진 별들이 이 선 위에 놓이므로 선은 아주 흐리게 깔아 길잡이만 한다. */}
      {!compact
        ? shape.edges.map(([a, b], i) => {
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
          })
        : null}

      {slots.map((slot, i) => {
        const star = stars[i]
        if (!star) {
          if (compact) return null
          // 아직 안 찍힌 자리 — 밝은 별 자리는 십자, 채움 자리는 아주 작은 점.
          return slot.anchor ? (
            <g key={`e${i}`} className={styles.empty} aria-hidden>
              <line x1={slot.x - 2} y1={slot.y} x2={slot.x + 2} y2={slot.y} />
              <line x1={slot.x} y1={slot.y - 2} x2={slot.x} y2={slot.y + 2} />
            </g>
          ) : (
            <circle key={`e${i}`} className={styles.emptyDot} cx={slot.x} cy={slot.y} r={0.5} aria-hidden />
          )
        }
        const label = labelOf?.(star)
        // 한 달치(최대 62개)가 선 위에 촘촘히 놓이므로 밝은 별을 조금 줄여 이웃을 덮지 않게 한다.
        const scale = slot.anchor ? 0.32 : 0.12
        return (
          <g
            key={`s${i}`}
            className={styles.star}
            style={{
              color: OWNER_VAR[star.owner],
              animationDelay: `${(hash(`${monthKey}:${i}`) % 20) * 0.17}s`,
            }}
          >
            {label ? <title>{label}</title> : null}
            {slot.anchor ? <circle className={styles.halo} cx={slot.x} cy={slot.y} r={3.6} /> : null}
            <path
              className={slot.anchor ? styles.spark : `${styles.spark} ${styles.sparkSmall}`}
              d={SPARKLE}
              transform={`translate(${slot.x} ${slot.y}) scale(${scale})`}
            />
          </g>
        )
      })}

      {/* 날아온 별이 박히는 지점 — 화면 좌표를 읽어야 해서 실제 노드가 필요하다. */}
      {targetId ? <circle id={targetId} className={styles.anchor} cx={next.x} cy={next.y} r={1} /> : null}
    </svg>
  )
}

/** 지난 달 하나를 나타내는 작은 글리프 — 완성이면 채운 별, 아니면 채운 만큼의 고리. */
export function MonthGlyph({
  monthKey,
  filled,
  needed,
  complete,
}: {
  monthKey: string
  filled: number
  needed: number
  complete: boolean
}) {
  const shape = constellationOfMonth(monthKey)
  const pct = Math.min(filled / Math.max(needed, 1), 1)
  return (
    <span
      className={styles.glyph}
      title={`${monthKey} · ${shape.name} ${filled}/${needed}${complete ? ' 완성' : ''}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden className={styles.glyphSvg}>
        <circle className={styles.glyphTrack} cx="12" cy="12" r="9" />
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
      {/* 월은 숫자로도 읽혀야 한다 — 고리 길이만으로는 어느 달인지 모른다(§8). */}
      <span className={styles.glyphLabel}>{Number(monthKey.slice(5))}월</span>
    </span>
  )
}
