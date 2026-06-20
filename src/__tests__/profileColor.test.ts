import { describe, it, expect } from 'vitest'
import { PROFILE_PALETTE, defaultColorForRole } from '@/lib/profileColor'

// 사람 색 팔레트 — 색+이름 라벨 이중화(§8). 역할 기본색은 초대자/수락자 대비(dossier 02 §3).
describe('profileColor — 사람 색 팔레트 + 역할 기본색', () => {
  it('PROFILE_PALETTE는 {hex,label} 쌍의 배열이고 각 항목에 색+라벨이 둘 다 있다(색만으로 구분 금지, §8)', () => {
    expect(Array.isArray(PROFILE_PALETTE)).toBe(true)
    expect(PROFILE_PALETTE.length).toBeGreaterThanOrEqual(2)
    for (const entry of PROFILE_PALETTE) {
      expect(typeof entry.hex).toBe('string')
      expect(entry.hex).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(typeof entry.label).toBe('string')
      expect(entry.label.length).toBeGreaterThan(0)
    }
  })

  it('블루(#3b6db5)와 핑크(#c25d86) 트랙색을 포함한다', () => {
    const hexes = PROFILE_PALETTE.map((e) => e.hex)
    expect(hexes).toContain('#3b6db5')
    expect(hexes).toContain('#c25d86')
  })

  it('hex 값은 서로 다르다(구분 가능한 팔레트)', () => {
    const hexes = PROFILE_PALETTE.map((e) => e.hex)
    expect(new Set(hexes).size).toBe(hexes.length)
  })

  it("defaultColorForRole('user_a') → #3b6db5(블루), 'user_b') → #c25d86(핑크)", () => {
    expect(defaultColorForRole('user_a')).toBe('#3b6db5')
    expect(defaultColorForRole('user_b')).toBe('#c25d86')
  })
})
