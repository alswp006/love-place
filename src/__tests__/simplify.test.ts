import { describe, it, expect } from 'vitest'
import { simplifyPath, type LatLng } from '@/lib/recap/simplify'

describe('simplifyPath — Douglas–Peucker', () => {
  it('빈 배열/1점/2점은 그대로', () => {
    expect(simplifyPath([])).toEqual([])
    const one: LatLng[] = [{ lat: 37.5, lng: 127.0 }]
    expect(simplifyPath(one)).toEqual(one)
    const two: LatLng[] = [{ lat: 37.5, lng: 127.0 }, { lat: 37.6, lng: 127.1 }]
    expect(simplifyPath(two)).toEqual(two)
  })

  it('일직선상 중간점은 제거(양끝만 남음)', () => {
    const line: LatLng[] = [
      { lat: 37.5, lng: 127.0 },
      { lat: 37.5, lng: 127.001 }, // 동일 위도 직선상
      { lat: 37.5, lng: 127.002 },
      { lat: 37.5, lng: 127.003 },
    ]
    const out = simplifyPath(line, 8)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual(line[0])
    expect(out[1]).toEqual(line[3])
  })

  it('뚜렷한 꺾임(임계 초과)은 보존', () => {
    const bend: LatLng[] = [
      { lat: 37.5, lng: 127.0 },
      { lat: 37.51, lng: 127.0 }, // 위로 ~1.1km 꺾임 — 8m 임계 훨씬 초과
      { lat: 37.5, lng: 127.01 },
    ]
    const out = simplifyPath(bend, 8)
    expect(out).toHaveLength(3)
  })

  it('단순화 결과 길이는 원본 이하(단조)', () => {
    const noisy: LatLng[] = Array.from({ length: 50 }, (_, i) => ({
      lat: 37.5 + i * 0.0001,
      lng: 127.0 + (i % 2) * 0.000001, // 미세 지터
    }))
    const out = simplifyPath(noisy, 8)
    expect(out.length).toBeLessThanOrEqual(noisy.length)
    expect(out.length).toBeGreaterThanOrEqual(2)
  })
})
