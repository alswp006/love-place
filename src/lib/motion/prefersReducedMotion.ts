// reduce-motion 사용자 선호(JS 경로 전용 게이트). CSS 경로는 tokens.css가 토큰→0으로 자동 처리.
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
