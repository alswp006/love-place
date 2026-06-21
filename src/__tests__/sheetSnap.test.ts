import { describe, it, expect } from 'vitest'
import { SNAPS, nextSnap, prevSnap, snapForOffset, snapForFlick, translateYFor, dimProgress } from '@/lib/places/sheetSnap'

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

  // dimProgress: 시트 translateY → 백드롭 딤 진행(0..1). 드래그 중 손가락 1:1 추종용(이진 토글 아님).
  it('dimProgress: peek 정지에서 0, full 정지에서 1', () => {
    const peekRestY = 600
    const fullRestY = 58.24
    expect(dimProgress(peekRestY, peekRestY, fullRestY)).toBe(0)
    expect(dimProgress(fullRestY, peekRestY, fullRestY)).toBe(1)
  })

  it('dimProgress: peek~full 사이는 선형 보간', () => {
    const peekRestY = 600
    const fullRestY = 100
    // 정중간(350) → 0.5.
    expect(dimProgress(350, peekRestY, fullRestY)).toBeCloseTo(0.5, 5)
    // peek에서 1/4 진행(475) → 0.25.
    expect(dimProgress(475, peekRestY, fullRestY)).toBeCloseTo(0.25, 5)
  })

  it('dimProgress: 범위 밖은 0..1로 클램프 — peek 아래(translateY>peekRestY)면 0', () => {
    const peekRestY = 600
    const fullRestY = 100
    // peek 아래로 더 끌어내림(오버스크롤) → 0.
    expect(dimProgress(700, peekRestY, fullRestY)).toBe(0)
    // full 위로 더 끌어올림 → 1로 클램프.
    expect(dimProgress(0, peekRestY, fullRestY)).toBe(1)
  })

  it('dimProgress: peekRestY===fullRestY(0높이) 가드 → 0(0 나눗셈 방지)', () => {
    expect(dimProgress(100, 200, 200)).toBe(0)
  })
})
