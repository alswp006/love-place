import { describe, it, expect } from 'vitest'
import { contrastRatio, meetsAA } from '@/lib/a11y/contrast'

describe('WCAG 대비 유틸', () => {
  it('검정/흰색 = 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })
  it('같은 색 = 1:1', () => {
    expect(contrastRatio('#FF93AC', '#FF93AC')).toBeCloseTo(1, 1)
  })
  it('주요버튼 pink-400 + 자두텍스트는 본문 AA 통과(≈5.75:1)', () => {
    const r = contrastRatio('#FF93AC', '#5A2438')
    expect(r).toBeGreaterThanOrEqual(4.5)
  })
  it('본문 잉크 on white는 AA 통과(≈7.7:1)', () => {
    expect(contrastRatio('#6B4A52', '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })
  it('meetsAA: 본문 4.5 / 큰글씨 3.0 분기', () => {
    expect(meetsAA(4.6, { large: false })).toBe(true)
    expect(meetsAA(3.2, { large: false })).toBe(false)
    expect(meetsAA(3.2, { large: true })).toBe(true)
  })
})
