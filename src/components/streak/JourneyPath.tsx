import { STATIONS, type JourneyProgress } from '@/lib/streak/garden'
import styles from './JourneyPath.module.css'

// 길 위를 걷는 우리 — 완료 1건이 한 걸음이다.
//
// 왜 숫자(연속 N일)가 아니라 길인가: 연속 일수는 끊기는 순간 0이 되어 벌처럼 느껴진다.
// 여정은 뒤로 가지 않는다 — 쉬어도 걸어온 길은 남고, 다음 정거장이 계속 앞에 있다.
//
// 길은 3차 베지에 하나다. 캐릭터 위치는 DOM 측정 없이 t=ratio를 식에 넣어 구한다
// (getPointAtLength를 쓰면 렌더 후 측정이 필요해 첫 프레임에 캐릭터가 0,0에 튄다).

const VB = { w: 300, h: 80 }
const P0 = { x: 26, y: 58 }
const C1 = { x: 105, y: 8 }
const C2 = { x: 195, y: 104 }
const P3 = { x: 274, y: 58 }

/** 3차 베지에 위의 점 — 순수 계산이라 SSR/테스트에서도 같은 값이 나온다. */
export function pointAt(t: number): { x: number; y: number } {
  const u = 1 - t
  const b0 = u * u * u
  const b1 = 3 * u * u * t
  const b2 = 3 * u * t * t
  const b3 = t * t * t
  return {
    x: b0 * P0.x + b1 * C1.x + b2 * C2.x + b3 * P3.x,
    y: b0 * P0.y + b1 * C1.y + b2 * C2.y + b3 * P3.y,
  }
}

type Pt = { x: number; y: number }
const mix = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/**
 * 0…t 구간만 잘라낸 길(de Casteljau 분할).
 *
 * stroke-dasharray로 자르지 않는 이유: dasharray는 **호 길이** 기준이고 캐릭터 위치는
 * **파라미터 t** 기준이라, 곡선에서 둘이 어긋난다(걸어온 길 끝과 캐릭터가 따로 논다).
 * 같은 t로 잘라야 정확히 발밑에서 끝난다.
 */
export function prefixPath(t: number): string {
  const a = mix(P0, C1, t)
  const b = mix(C1, C2, t)
  const c = mix(C2, P3, t)
  const d = mix(a, b, t)
  const e = mix(b, c, t)
  const f = mix(d, e, t)
  return `M ${P0.x} ${P0.y} C ${a.x} ${a.y}, ${d.x} ${d.y}, ${f.x} ${f.y}`
}

const STATION_EMOJI: Record<(typeof STATIONS)[number]['key'], string> = {
  cafe: '☕',
  beach: '🏖',
  mountain: '⛰',
  tent: '⛺',
  ferris: '🎡',
}

export function JourneyPath({
  progress,
  mineColor,
  partnerColor,
  compact = false,
}: {
  progress: JourneyProgress
  mineColor: string
  partnerColor: string
  /** 접힌 줄에서 쓰는 작은 버전 — 정거장 이름표를 빼고 높이를 줄인다. */
  compact?: boolean
}) {
  // 0걸음/10걸음일 때 캐릭터가 정거장 위에 정확히 겹쳐 안 보이는 것을 막는다 —
  // 길 양 끝에서 살짝 안쪽으로 들여 놓는다(진행도 자체는 그대로).
  // 0걸음/10걸음일 때 캐릭터가 정거장 위에 정확히 겹쳐 안 보이는 것을 막는다 —
  // 길 양 끝에서 살짝 안쪽으로 들여 놓는다(진행도 자체는 그대로).
  const walkT = 0.09 + progress.ratio * 0.82
  const p = pointAt(walkT)
  const d = `M ${P0.x} ${P0.y} C ${C1.x} ${C1.y}, ${C2.x} ${C2.y}, ${P3.x} ${P3.y}`
  // 방금 정거장에 도착했나 — 도착 순간에만 반짝인다(계속 반짝이면 소음이 된다).
  const justArrived = progress.steps > 0 && progress.stepInLeg === 0

  return (
    <svg
      className={compact ? `${styles.svg} ${styles.compact}` : styles.svg}
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      role="img"
      aria-label={`${progress.from.label}에서 ${progress.to.label}로 가는 중 — ${progress.stepInLeg}걸음 걸었고 ${progress.remaining}걸음 남았어요`}
    >
      {/* 걸어온 길과 남은 길을 다르게 — 색이 아니라 선 모양(실선/점선)으로 구분한다(§8). */}
      <path className={styles.roadRest} d={d} />
      <path className={styles.roadDone} d={prefixPath(walkT)} />

      {/* 정거장 — 지나온 곳(왼쪽)은 컬러, 앞으로 갈 곳(오른쪽)은 아직 흐리게. */}
      <text className={styles.station} x={P0.x} y={P0.y - 14} textAnchor="middle">
        {STATION_EMOJI[progress.from.key]}
      </text>
      <text
        className={justArrived ? `${styles.station} ${styles.stationPop}` : `${styles.station} ${styles.stationNext}`}
        x={P3.x}
        y={P3.y - 14}
        textAnchor="middle"
      >
        {STATION_EMOJI[progress.to.key]}
      </text>

      {!compact ? (
        <>
          <text className={styles.stationLabel} x={P0.x} y={VB.h - 4} textAnchor="middle">
            {progress.from.label}
          </text>
          <text className={styles.stationLabel} x={P3.x} y={VB.h - 4} textAnchor="middle">
            {progress.to.label}
          </text>
        </>
      ) : null}

      {/* 우리 둘 — 손잡고 걷는 두 점. 색은 캘린더 트랙과 같은 축(나/상대). */}
      <g className={styles.walker} style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
        <line className={styles.hands} x1={-5} y1={-7} x2={5} y2={-7} />
        <circle className={styles.me} cx={-5} cy={-9} r={5} style={{ fill: mineColor }} />
        <circle className={styles.you} cx={5} cy={-9} r={5} style={{ fill: partnerColor }} />
      </g>

      {/* 도착 순간의 작은 색종이 — Reduce Motion에서는 CSS가 통째로 숨긴다. */}
      {justArrived ? (
        <g className={styles.confetti} aria-hidden>
          <circle cx={P3.x - 8} cy={P3.y - 26} r={2} />
          <circle cx={P3.x + 7} cy={P3.y - 30} r={1.6} />
          <circle cx={P3.x + 1} cy={P3.y - 34} r={1.8} />
        </g>
      ) : null}
    </svg>
  )
}
