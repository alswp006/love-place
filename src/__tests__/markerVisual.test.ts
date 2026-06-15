import { describe, it, expect } from 'vitest'
import { markerVisual } from '@/lib/places/markerVisual'

describe('markerVisual (마커 모양 이중화)', () => {
  it('가고싶음(찜만) = 빈 별 ☆', () => {
    const v = markerVisual({ visited: false, bothWished: false, name: '카페' })
    expect(v.glyph).toBe('☆')
    expect(v.kind).toBe('wish')
    expect(v.label).toContain('가고싶음')
  })
  it('둘 다 찜 = 하트 ♥', () => {
    const v = markerVisual({ visited: false, bothWished: true, name: '카페' })
    expect(v.glyph).toBe('♥')
    expect(v.kind).toBe('both')
    expect(v.label).toContain('둘 다 찜')
  })
  it('가봤음 = 채운 별 ★ (둘 다 찜보다 우선)', () => {
    const v = markerVisual({ visited: true, bothWished: true, name: '카페' })
    expect(v.glyph).toBe('★')
    expect(v.kind).toBe('visited')
    expect(v.label).toContain('가봤음')
  })
  it('가봤음 마커엔 체크 배지(✓)가 붙는다(색만이 아닌 실루엣 구분)', () => {
    expect(markerVisual({ visited: true, bothWished: false, name: '카페' }).badge).toBe('✓')
    expect(markerVisual({ visited: false, bothWished: true, name: '카페' }).badge).toBeUndefined()
    expect(markerVisual({ visited: false, bothWished: false, name: '카페' }).badge).toBeUndefined()
  })
})
