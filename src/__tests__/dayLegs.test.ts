import { describe, it, expect } from 'vitest'
import { dayLegs, legIndexByFromId, formatDistance, legsKey } from '@/lib/trips/dayLegs'

const P = (id: string, lat: number | null, lng: number | null) => ({ id, lat, lng })
const coordOf = (s: { lat: number | null; lng: number | null }) =>
  s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null

describe('dayLegs', () => {
  it('인접 스톱 쌍마다 구간 하나(N개 스톱 → N-1개 구간)', () => {
    const legs = dayLegs([P('a', 37, 127), P('b', 38, 128), P('c', 39, 129)], coordOf)
    expect(legs.map((l) => `${l.fromId}>${l.toId}`)).toEqual(['a>b', 'b>c'])
  })

  it('스톱이 하나뿐이면 구간 없음', () => {
    expect(dayLegs([P('a', 37, 127)], coordOf)).toEqual([])
  })

  it('좌표 없는 스톱이 끼면 그 스톱이 걸린 두 구간을 모두 뺀다 — 억지로 잇지 않는다', () => {
    // b에 좌표가 없으면 a>b, b>c 둘 다 생기지 않는다(a>c로 건너뛰면 거짓 거리가 된다).
    const legs = dayLegs([P('a', 37, 127), P('b', null, null), P('c', 39, 129)], coordOf)
    expect(legs).toEqual([])
  })

  it('좌표 없는 스톱 뒤에도 정상 구간은 살아남는다', () => {
    const legs = dayLegs(
      [P('a', 37, 127), P('b', null, null), P('c', 39, 129), P('d', 40, 130)],
      coordOf,
    )
    expect(legs.map((l) => `${l.fromId}>${l.toId}`)).toEqual(['c>d'])
  })
})

describe('legIndexByFromId', () => {
  it('스톱 id → 그 아래 붙을 구간 인덱스', () => {
    const legs = dayLegs([P('a', 37, 127), P('b', 38, 128), P('c', 39, 129)], coordOf)
    expect(legIndexByFromId(legs)).toEqual({ a: 0, b: 1 })
  })
})

describe('formatDistance', () => {
  it('1km 미만은 m(10m 단위), 이상은 km(소수 1)', () => {
    expect(formatDistance(352)).toBe('350m')
    expect(formatDistance(999)).toBe('1000m')
    expect(formatDistance(1240)).toBe('1.2km')
    expect(formatDistance(52340)).toBe('52.3km')
  })

  it('미상이면 null — 0km 같은 거짓말 대신 칩을 숨기게 한다', () => {
    expect(formatDistance(null)).toBeNull()
    expect(formatDistance(undefined)).toBeNull()
    expect(formatDistance(Number.NaN)).toBeNull()
    expect(formatDistance(-1)).toBeNull()
  })

  it('0m는 유효한 값이다(같은 자리)', () => {
    expect(formatDistance(0)).toBe('0m')
  })
})

describe('legsKey', () => {
  it('순서·좌표가 바뀌면 키가 달라진다(캐시 무효화)', () => {
    const base = dayLegs([P('a', 37, 127), P('b', 38, 128)], coordOf)
    const reordered = dayLegs([P('b', 38, 128), P('a', 37, 127)], coordOf)
    const moved = dayLegs([P('a', 37, 127), P('b', 38.5, 128)], coordOf)
    expect(legsKey(reordered)).not.toBe(legsKey(base))
    expect(legsKey(moved)).not.toBe(legsKey(base))
  })

  it('같은 구성이면 같은 키(불필요한 재요청 방지)', () => {
    const a = dayLegs([P('a', 37, 127), P('b', 38, 128)], coordOf)
    const b = dayLegs([P('a', 37, 127), P('b', 38, 128)], coordOf)
    expect(legsKey(a)).toBe(legsKey(b))
  })
})
