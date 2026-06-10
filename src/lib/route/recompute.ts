// 도착시각 결정론 재계산(§5.6) — AI 산술을 신뢰하지 않고 앱이 다시 계산.
// 도착[i] = 도착[i-1] + 직전 체류분 + (직전→현재) 이동분. 순수 함수(테스트로 못박음).

export type LegStop = {
  stayMin: number // 이 stop 체류 분
  legMinToHere: number // 직전 stop → 이 stop 이동 분(첫 stop은 0)
}

/** 시작 시각(분, 자정 기준)부터 각 stop 도착 시각(분) 배열을 재계산. */
export function recomputeArrivals(startMinutes: number, stops: LegStop[]): number[] {
  const arrivals: number[] = []
  for (let i = 0; i < stops.length; i++) {
    if (i === 0) {
      arrivals.push(startMinutes)
      continue
    }
    const prev = stops[i - 1]!
    arrivals.push(arrivals[i - 1]! + prev.stayMin + stops[i]!.legMinToHere)
  }
  return arrivals
}

/** 분(자정 기준) → 'HH:mm'. 24시 넘어가면 그대로(다음날 표기는 호출부). */
export function minutesToHHmm(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`
}
