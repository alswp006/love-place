import { describe, it, expect } from 'vitest'
import { SNAPS, nextSnap, prevSnap, snapForOffset, snapForFlick, translateYFor } from '@/lib/places/sheetSnap'

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

  it('snapForFlick: |v|<임계(느린 드래그)는 위치 기반 흡착과 동일', () => {
    const travel = 728
    const peekPx = 128
    // 느린 속도 → snapForOffset과 동일하게 위치 기반.
    expect(snapForFlick(600, 0, travel, peekPx)).toBe(snapForOffset(600, travel, peekPx))
    expect(snapForFlick(360, 0.2, travel, peekPx)).toBe(snapForOffset(360, travel, peekPx))
    expect(snapForFlick(60, -0.49, travel, peekPx)).toBe(snapForOffset(60, travel, peekPx))
  })

  it('snapForFlick: 빠른 아래 플릭(v>0.5)은 가장 가까운 스냅에서 한 단계 접음(prev)', () => {
    const travel = 728
    const peekPx = 128
    // full(60≈58.24) 근처에서 빠르게 아래로 → prevSnap(full)=half.
    expect(snapForFlick(60, 0.8, travel, peekPx)).toBe('half')
  })

  it('snapForFlick: 빠른 위 플릭(v<-0.5)은 가장 가까운 스냅에서 한 단계 펼침(next)', () => {
    const travel = 728
    const peekPx = 128
    // peek(600) 근처에서 빠르게 위로 → nextSnap(peek)=half.
    expect(snapForFlick(600, -0.8, travel, peekPx)).toBe('half')
  })
})
