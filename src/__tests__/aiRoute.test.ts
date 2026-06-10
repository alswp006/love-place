import { describe, it, expect } from 'vitest'
import { validateRoute } from '@/lib/anthropic/routeSchema'
import { nearestNeighborOrder } from '@/lib/route/fallbackTsp'
import { recomputeArrivals, minutesToHHmm } from '@/lib/route/recompute'

const allowed = new Set(['p1', 'p2', 'p3'])

describe('validateRoute (화이트리스트 + strict)', () => {
  it('유효한 출력 통과', () => {
    const input = { days: [{ day: 1, stops: [{ placeId: 'p1', arrive: '10:00', stayMin: 60, moveMemo: '', reason: '카페' }] }] }
    const r = validateRoute(input, allowed)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.plan.days[0]?.stops[0]?.placeId).toBe('p1')
  })

  it('화이트리스트 밖 place_id(환각)는 거부', () => {
    const input = { days: [{ day: 1, stops: [{ placeId: 'HALLUCINATED', stayMin: 60 }] }] }
    const r = validateRoute(input, allowed)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('환각')
  })

  it('days 배열 없으면 거부', () => {
    expect(validateRoute({}, allowed).ok).toBe(false)
    expect(validateRoute({ days: 'nope' }, allowed).ok).toBe(false)
  })

  it('placeId 누락 stop 거부', () => {
    const r = validateRoute({ days: [{ day: 1, stops: [{ stayMin: 30 }] }] }, allowed)
    expect(r.ok).toBe(false)
  })

  it('누락 필드는 안전 기본값으로 보정', () => {
    const r = validateRoute({ days: [{ day: 1, stops: [{ placeId: 'p2' }] }] }, allowed)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.plan.days[0]?.stops[0]?.stayMin).toBe(60)
  })
})

describe('nearestNeighborOrder (결정론 폴백)', () => {
  const places = [
    { id: 'a', lat: 37.0, lng: 127.0 },
    { id: 'b', lat: 37.1, lng: 127.0 },
    { id: 'c', lat: 37.5, lng: 127.0 },
  ]
  it('startId에서 시작해 가까운 순으로, 모두 1회 방문', () => {
    expect(nearestNeighborOrder(places, 'a')).toEqual(['a', 'b', 'c'])
  })
  it('startId 없으면 첫 장소부터', () => {
    expect(nearestNeighborOrder(places)).toEqual(['a', 'b', 'c'])
  })
  it('빈 입력 → 빈 배열', () => {
    expect(nearestNeighborOrder([])).toEqual([])
  })
  it('같은 입력 → 같은 출력(결정론)', () => {
    expect(nearestNeighborOrder(places, 'c')).toEqual(nearestNeighborOrder(places, 'c'))
  })
})

describe('recomputeArrivals (도착시각 재계산)', () => {
  it('도착[i] = 도착[i-1] + 직전 체류 + 이동', () => {
    // 10:00 시작, A(체류60), 이동30→B(체류90), 이동20→C
    const arr = recomputeArrivals(600, [
      { stayMin: 60, legMinToHere: 0 },
      { stayMin: 90, legMinToHere: 30 },
      { stayMin: 0, legMinToHere: 20 },
    ])
    expect(arr).toEqual([600, 690, 800]) // 10:00, 11:30, 13:20
    expect(minutesToHHmm(arr[1]!)).toBe('11:30')
    expect(minutesToHHmm(arr[2]!)).toBe('13:20')
  })
})
