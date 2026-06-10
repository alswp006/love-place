import { describe, it, expect } from 'vitest'
import { buildCoursePlan } from '@/lib/route/coursePlan'

describe('buildCoursePlan (결정론 코스)', () => {
  const places = [
    { id: 'a', name: 'A', lat: 37.0, lng: 127.0 },
    { id: 'b', name: 'B', lat: 37.1, lng: 127.0 },
    { id: 'c', name: 'C', lat: 37.5, lng: 127.0 },
  ]

  it('거리순 + 도착시각 재계산(10:00 시작, 체류90 이동30)', () => {
    const plan = buildCoursePlan(places, '2026-06-15')
    expect(plan.map((s) => s.placeId)).toEqual(['a', 'b', 'c']) // nearest-neighbor
    // A 10:00~11:30, B 12:00~13:30(11:30+30이동), C 14:00~15:30
    expect(plan[0]?.start).toBe(new Date('2026-06-15T10:00:00+09:00').toISOString())
    expect(plan[1]?.start).toBe(new Date('2026-06-15T12:00:00+09:00').toISOString())
    expect(plan[2]?.start).toBe(new Date('2026-06-15T14:00:00+09:00').toISOString())
    expect(plan[0]?.title).toBe('A')
  })

  it('각 stop end = start + 체류분', () => {
    const plan = buildCoursePlan(places, '2026-06-15')
    for (const s of plan) {
      expect(new Date(s.end).getTime() - new Date(s.start).getTime()).toBe(90 * 60 * 1000)
    }
  })
})
