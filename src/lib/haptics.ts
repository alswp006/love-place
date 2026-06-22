import { isNativePlatform } from './platform'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

// 햅틱 — 네이티브(Capacitor)는 @capacitor/haptics(iOS WKWebView는 navigator.vibrate 미지원이라 필수),
// 웹은 navigator.vibrate 폴백(미지원 브라우저는 no-op). 시각 피드백과 항상 병행(ux §1).
export function haptic(pattern: number | number[] = 10): boolean {
  if (isNativePlatform()) {
    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    return true
  }
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
