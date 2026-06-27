import { describe, it, expect } from 'vitest'
import {
  parseRoutePoint,
  parseRoutePoints,
  isConsentType,
  CONSENT_TYPES,
} from '@/lib/journey/types'

describe('journey/types — 경계 파서', () => {
  it('parseRoutePoint: 정상 점은 통과(accuracy 없으면 null)', () => {
    expect(parseRoutePoint({ recorded_at: '2026-06-01T10:00:00Z', lat: 37.5, lng: 127 })).toEqual({
      recorded_at: '2026-06-01T10:00:00Z',
      lat: 37.5,
      lng: 127,
      accuracy_m: null,
    })
    expect(
      parseRoutePoint({ recorded_at: '2026-06-01T10:00:00Z', lat: 37.5, lng: 127, accuracy_m: 12 })
        ?.accuracy_m,
    ).toBe(12)
  })

  it('parseRoutePoint: lat/lng 범위 밖·누락·잘못된 타입은 null', () => {
    expect(parseRoutePoint({ recorded_at: 't', lat: 200, lng: 127 })).toBeNull()
    expect(parseRoutePoint({ recorded_at: 't', lat: 37, lng: 999 })).toBeNull()
    expect(parseRoutePoint({ recorded_at: '', lat: 37, lng: 127 })).toBeNull()
    expect(parseRoutePoint({ lat: 37, lng: 127 })).toBeNull()
    expect(parseRoutePoint(null)).toBeNull()
    expect(parseRoutePoint({ recorded_at: 't', lat: '37', lng: 127 })).toBeNull()
  })

  it('parseRoutePoints: 배열에서 불량 점 제외', () => {
    const out = parseRoutePoints([
      { recorded_at: 't1', lat: 37.5, lng: 127 },
      { recorded_at: 't2', lat: 999, lng: 127 }, // 불량
      'nope',
      { recorded_at: 't3', lat: 37.6, lng: 127.1 },
    ])
    expect(out).toHaveLength(2)
    expect(parseRoutePoints('not-array')).toEqual([])
  })

  it('isConsentType: 4종만 통과', () => {
    expect(CONSENT_TYPES).toHaveLength(4)
    expect(isConsentType('COLLECT_USE')).toBe(true)
    expect(isConsentType('THIRD_PARTY_PROVIDE_PARTNER')).toBe(true)
    expect(isConsentType('NOPE')).toBe(false)
    expect(isConsentType(123)).toBe(false)
  })
})
