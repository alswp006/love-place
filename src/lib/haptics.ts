// feature-detect 햅틱. iOS Safari는 navigator.vibrate 미지원 → no-op. 시각 피드백과 항상 병행(ux §1).
export function haptic(pattern: number | number[] = 10): boolean {
  if (typeof navigator === 'undefined') return false
  // NOTE: adapted from plan — the intersection cast `Navigator & { vibrate?: ... }` does not
  // compile against the current lib.dom.d.ts (DOM.Iterable) because intersecting with the
  // existing `vibrate(pattern: VibratePattern)` overload collapses the param to Iterable<number>.
  // Casting the read value to a standalone function type is functionally identical and compiles.
  const v = navigator.vibrate as ((p: number | number[]) => boolean) | undefined
  if (typeof v !== 'function') return false
  try {
    return v.call(navigator, pattern)
  } catch {
    return false
  }
}
