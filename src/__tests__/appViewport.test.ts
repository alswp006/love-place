import { describe, it, expect } from 'vitest'
import { sheetTravelHeight } from '@/lib/layout/appViewport'

describe('appViewport (단일 dvh 소스 — 탭바 제외 시트 이동 높이)', () => {
  it('시트 이동 높이 = vh - tabbarH - safeBottom', () => {
    expect(sheetTravelHeight(800, 72, 0)).toBe(728)
    expect(sheetTravelHeight(800, 72, 34)).toBe(694)
  })
  it('음수로 떨어지지 않게 0으로 클램프', () => {
    expect(sheetTravelHeight(50, 72, 34)).toBe(0)
  })
})
