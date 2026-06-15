import { describe, it, expect } from 'vitest'
import { SNAPS, nextSnap, prevSnap, snapForOffset, translateYFor } from '@/lib/places/sheetSnap'

describe('sheetSnap (시트 스냅 전이 — 탭바 제외)', () => {
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

  it('translateYFor: peek는 콘텐츠 px만 보이게(travel - peekPx), half/full은 travel 비율', () => {
    // travel(탭바 제외) = 728, peekPx = 128 → peek translate = 728 - 128 = 600
    expect(translateYFor('peek', 728, 128)).toBe(600)
    // half ratio 0.5 → translate = 728*(1-0.5) = 364
    expect(translateYFor('half', 728, 128)).toBe(364)
    // full ratio 0.92 → translate = 728*(1-0.92) = 58.24
    expect(translateYFor('full', 728, 128)).toBeCloseTo(58.24, 2)
  })

  it('snapForOffset: 가까운 스냅으로 흡착(travel + peekPx 기준)', () => {
    const travel = 728
    const peekPx = 128
    expect(snapForOffset(600, travel, peekPx)).toBe('peek')
    expect(snapForOffset(360, travel, peekPx)).toBe('half')
    expect(snapForOffset(60, travel, peekPx)).toBe('full')
  })

  it('snapForOffset: 화면 밖(음수/초과)도 클램프해 가장 가까운 스냅', () => {
    const travel = 728
    const peekPx = 128
    expect(snapForOffset(-50, travel, peekPx)).toBe('full')
    expect(snapForOffset(99999, travel, peekPx)).toBe('peek')
  })
})
