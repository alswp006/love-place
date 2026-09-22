import { describe, it, expect } from 'vitest'
import { PROFILE_PALETTE, defaultColorForRole, swatchesFor } from '@/lib/profileColor'
import { LEGACY_PROFILE_HEXES, isPaletteColor } from '@/lib/colorPalette'
import { CATEGORY_COLORS } from '@/hooks/useEventCategories'

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

  it('분류 색과 **같은 목록**이다 — 같은 이름이 다른 색이면 그 자체로 버그다', () => {
    // 예전엔 프로필 4색 / 분류 6색이 따로 있었고 이름은 같은데 hex가 달랐다.
    expect(PROFILE_PALETTE.map((e) => e.hex)).toEqual([...CATEGORY_COLORS])
  })

  it('진한 톤마다 파스텔 짝이 있다 — 12색조 × 2', () => {
    expect(PROFILE_PALETTE).toHaveLength(24)
    const labels = PROFILE_PALETTE.map((e) => e.label)
    for (const l of labels.filter((x) => !x.startsWith('연'))) {
      expect(labels).toContain(`연${l}`)
    }
  })

  it('예전 색은 견본에서 빠졌지만 **유효한 값으로 남는다**', () => {
    // 안 남기면 그 색을 쓰던 사람의 프로필이 고른 적 없는 색으로 조용히 바뀐다.
    for (const hex of LEGACY_PROFILE_HEXES) {
      expect(isPaletteColor(hex)).toBe(true)
    }
    expect(PROFILE_PALETTE.map((e) => e.hex)).not.toContain('#6e5aa8')
  })

  it('hex 값은 서로 다르다(구분 가능한 팔레트)', () => {
    const hexes = PROFILE_PALETTE.map((e) => e.hex)
    expect(new Set(hexes).size).toBe(hexes.length)
  })

  it('기본색은 **팔레트 안**에 있어야 한다 — 처음 연 사람이 빈 고르개를 보면 안 된다', () => {
    const hexes = PROFILE_PALETTE.map((e) => e.hex)
    expect(hexes).toContain(defaultColorForRole('user_a'))
    expect(hexes).toContain(defaultColorForRole('user_b'))
  })

  it('둘이 서로 다르고 브랜드 핑크가 아니다 — 내 색이 상대 트랙으로 읽히면 안 된다', () => {
    const a = defaultColorForRole('user_a')
    const b = defaultColorForRole('user_b')
    expect(a).not.toBe(b)
    expect([a, b]).not.toContain('#e2638a')
  })
})

describe('swatchesFor — 지금 값이 목록에 없어도 골라져 보인다', () => {
  it('예전 색을 쓰던 사람에게 그 색 칸이 생긴다', () => {
    const sw = swatchesFor('#6e5aa8') // 옛 라벤더
    expect(sw[0]!.hex).toBe('#6e5aa8')
    expect(sw).toHaveLength(PROFILE_PALETTE.length + 1)
  })

  it('이름이 새 팔레트와 겹치지 않는다 — 스크린리더가 둘을 가를 수 있어야 한다(§8)', () => {
    // 옛 라벤더(#6e5aa8)와 새 라벤더(#8b6ec8)는 이름이 같다. 그대로 두면 견본 두 칸이
    // 똑같이 '라벤더'로 읽혀 어느 쪽이 지금 내 색인지 알 방법이 없다.
    const sw = swatchesFor('#6e5aa8')
    expect(new Set(sw.map((e) => e.label)).size).toBe(sw.length)
    expect(sw[0]!.label).toBe('라벤더(지금 색)')
  })

  it('팔레트 안의 값이면 덧붙이지 않는다', () => {
    expect(swatchesFor(PROFILE_PALETTE[0]!.hex)).toHaveLength(PROFILE_PALETTE.length)
  })

  it('대문자로 저장돼 있어도 같은 색으로 본다', () => {
    expect(swatchesFor('#6E5AA8')).toHaveLength(PROFILE_PALETTE.length + 1)
  })

  it('값이 없으면 팔레트 그대로', () => {
    expect(swatchesFor(null)).toHaveLength(PROFILE_PALETTE.length)
  })

  it('팔레트에도 옛 목록에도 없는 값이면 이름을 지어내지 않는다', () => {
    expect(swatchesFor('#123456')[0]!.label).toBe('지금 색')
  })
})
