import { describe, it, expect } from 'vitest'
import { SNAPS, nextSnap, prevSnap, snapForOffset } from '@/lib/places/sheetSnap'

describe('sheetSnap (시트 스냅 전이 — 순수 로직)', () => {
  it('SNAPS는 peek<half<full 순으로 비율을 정의한다', () => {
    expect(SNAPS.map((s) => s.id)).toEqual(['peek', 'half', 'full'])
    expect(SNAPS[0]!.ratio).toBeLessThan(SNAPS[1]!.ratio)
    expect(SNAPS[1]!.ratio).toBeLessThan(SNAPS[2]!.ratio)
  })

  it('nextSnap: peek→half→full→full(클램프)', () => {
    expect(nextSnap('peek')).toBe('half')
    expect(nextSnap('half')).toBe('full')
    expect(nextSnap('full')).toBe('full')
  })

  it('prevSnap: full→half→peek→peek(클램프)', () => {
    expect(prevSnap('full')).toBe('half')
    expect(prevSnap('half')).toBe('peek')
    expect(prevSnap('peek')).toBe('peek')
  })

  it('snapForOffset: 가까운 스냅으로 흡착(viewport 높이 기준)', () => {
    const h = 800
    // peek=0.18→translateY≈656, half=0.5→400, full=0.92→64 (translateY = h*(1-ratio))
    expect(snapForOffset(660, h)).toBe('peek')
    expect(snapForOffset(410, h)).toBe('half')
    expect(snapForOffset(80, h)).toBe('full')
  })

  it('snapForOffset: 화면 밖(음수/초과) 입력도 클램프해 가장 가까운 스냅', () => {
    const h = 800
    expect(snapForOffset(-50, h)).toBe('full')
    expect(snapForOffset(99999, h)).toBe('peek')
  })
})
