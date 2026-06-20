// 드래그 시트 스냅 전이 — 순수 로직(테스트로 못박음). naver/DOM 비의존.
// ratio = 시트가 차지하는 viewport 비율(높을수록 더 펼침). translateY = height*(1-ratio).

export type SnapStop = 'peek' | 'half' | 'full'
export type SnapDef = { id: SnapStop; ratio: number }

// peek: 핸들+요약만 / half: 절반 / full: 거의 전체(상단 safe-area 여백 남김).
export const SNAPS: readonly SnapDef[] = [
  { id: 'peek', ratio: 0.18 },
  { id: 'half', ratio: 0.5 },
  { id: 'full', ratio: 0.92 },
] as const

const ORDER: SnapStop[] = ['peek', 'half', 'full']

/** 한 단계 펼침(탭 대체 버튼·아래→위 드래그). full에서 클램프. */
export function nextSnap(cur: SnapStop): SnapStop {
  const i = ORDER.indexOf(cur)
  return ORDER[Math.min(i + 1, ORDER.length - 1)]!
}

/** 한 단계 접음(위→아래 드래그). peek에서 클램프. */
export function prevSnap(cur: SnapStop): SnapStop {
  const i = ORDER.indexOf(cur)
  return ORDER[Math.max(i - 1, 0)]!
}

/** ratio → 시트 상단 translateY(px). 탭바 제외 travel 높이 기준. peek는 콘텐츠 px만 노출. */
export function translateYFor(stop: SnapStop, travelHeight: number, peekPx: number): number {
  if (stop === 'peek') return Math.max(0, travelHeight - peekPx)
  const def = SNAPS.find((s) => s.id === stop)!
  return travelHeight * (1 - def.ratio)
}

/** 드래그 종료 시 현재 translateY에 가장 가까운 스냅으로 흡착(탭바 제외 travel + peekPx 기준). */
export function snapForOffset(translateY: number, travelHeight: number, peekPx: number): SnapStop {
  let best: SnapStop = 'peek'
  let bestDist = Infinity
  for (const s of SNAPS) {
    const y = s.id === 'peek' ? Math.max(0, travelHeight - peekPx) : travelHeight * (1 - s.ratio)
    const d = Math.abs(translateY - y)
    if (d < bestDist) {
      bestDist = d
      best = s.id
    }
  }
  return best
}

/** 플릭 속도(px/ms; 아래로 +, 위로 -)를 반영한 스냅. |v|<임계는 위치 기반과 동일. */
export function snapForFlick(
  translateY: number,
  velocity: number,
  travelHeight: number,
  peekPx: number,
  threshold = 0.5,
): SnapStop {
  const nearest = snapForOffset(translateY, travelHeight, peekPx)
  if (Math.abs(velocity) < threshold) return nearest
  // 아래로 빠르게 = 접기(prev), 위로 빠르게 = 펼치기(next).
  return velocity > 0 ? prevSnap(nearest) : nextSnap(nearest)
}
