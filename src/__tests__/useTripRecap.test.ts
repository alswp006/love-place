import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('@/hooks/useTrips', () => ({
  useTrips: () => ({
    data: [{ id: 't1', title: '속초', start_date: '2026-05-01', end_date: '2026-05-02', region_code: null, version: 1 }],
    isLoading: false,
  }),
}))
vi.mock('@/hooks/useVisits', () => ({
  useVisits: () => ({
    data: [
      { id: 'v2', place_id: 'p2', trip_id: 't1', visit_date: '2026-05-02', version: 1 },
      { id: 'v1', place_id: 'p1', trip_id: 't1', visit_date: '2026-05-01', version: 1 },
      { id: 'vX', place_id: 'p9', trip_id: 't2', visit_date: '2026-05-01', version: 1 }, // 다른 여행
    ],
    isLoading: false,
  }),
}))
vi.mock('@/hooks/usePlaces', () => ({
  usePlaces: () => ({
    data: [
      { id: 'p1', name: '첫집', lat: 37, lng: 127, region_label: '서울' },
      { id: 'p2', name: '둘째', lat: 38, lng: 127, region_label: '속초' },
    ],
    isLoading: false,
  }),
}))

import { useTripRecap } from '@/hooks/useTripRecap'

describe('useTripRecap', () => {
  it('tripId 방문만 시간순 정점으로 도출하고 스탯을 계산한다', () => {
    const { result } = renderHook(() => useTripRecap('c1', 't1'))
    expect(result.current.trip?.title).toBe('속초')
    expect(result.current.vertices.map((v) => v.visitId)).toEqual(['v1', 'v2']) // 날짜순, t2 제외
    expect(result.current.stats.stopCount).toBe(2)
    expect(result.current.stats.days).toBe(2)
    expect(result.current.stats.distanceKm).toBeGreaterThan(110)
  })

  it('없는 tripId면 trip=null·정점 0', () => {
    const { result } = renderHook(() => useTripRecap('c1', 'nope'))
    expect(result.current.trip).toBeNull()
    expect(result.current.vertices).toEqual([])
  })
})
