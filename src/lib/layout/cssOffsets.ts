// CSS 커스텀 프로퍼티(px) → 숫자. 토큰 단일출처(매직넘버 금지). PlaceSheet가 --tabbar-h/--sheet-peek-h를 읽음.
export function readPxVar(name: string, fallback: number): number {
  if (typeof document === 'undefined') return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : fallback
}
