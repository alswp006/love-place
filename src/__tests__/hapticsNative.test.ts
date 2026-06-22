import { describe, it, expect, vi, beforeEach } from 'vitest'

// 네이티브 분기: isNativePlatform()=true면 @capacitor/haptics를 쓴다(iOS WKWebView vibrate 미지원 해소).
const impact = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/lib/platform', () => ({ isNativePlatform: () => true, getPlatformName: () => 'ios' }))
vi.mock('@capacitor/haptics', () => ({ Haptics: { impact }, ImpactStyle: { Light: 'LIGHT' } }))

import { haptic } from '@/lib/haptics'

describe('haptic — 네이티브(Capacitor)', () => {
  beforeEach(() => impact.mockClear())

  it('네이티브에선 Haptics.impact를 호출하고 navigator.vibrate를 쓰지 않는다', () => {
    const vibrate = vi.fn(() => true)
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true })
    const r = haptic()
    expect(impact).toHaveBeenCalledTimes(1)
    expect(vibrate).not.toHaveBeenCalled()
    expect(r).toBe(true)
  })
})
