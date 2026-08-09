import { describe, it, expect } from 'vitest'
import { trimEnds, shareablePath, formatTotalKm, SHARE_TRIM_M } from '@/lib/recap/sharePath'
import { haversineKm } from '@/lib/recap/recapStats'

// 공유 카드에 올라가는 경로 = 인스타에 올라가는 경로다.
// 여기가 뚫리면 **집 주소를 공개하는 앱**이 된다. 그래서 이 파일의 계약은 하나다:
// 트림을 거치지 않은 좌표는 카드로 나가지 않는다.

/** 서울 근처에서 북쪽으로 일정 간격 걸어가는 경로. 위도 1e-5 ≈ 1.1m. */
function walkNorth(count: number, stepM = 50, lat0 = 37.5, lng0 = 127.0) {
  const dLat = stepM / 111_320
  return Array.from({ length: count }, (_, i) => ({ lat: lat0 + i * dLat, lng: lng0 }))
}

describe('trimEnds — 양 끝을 잘라 출발지·도착지를 지운다', () => {
  it('시작점 반경 안의 점이 남지 않는다', () => {
    const pts = walkNorth(60) // 약 3km
    const out = trimEnds(pts)
    expect(out.length).toBeGreaterThan(1)
    for (const p of out) {
      expect(haversineKm(pts[0]!, p) * 1000).toBeGreaterThanOrEqual(SHARE_TRIM_M)
    }
  })

  it('도착점 반경 안의 점도 남지 않는다', () => {
    const pts = walkNorth(60)
    const last = pts[pts.length - 1]!
    for (const p of trimEnds(pts)) {
      expect(haversineKm(last, p) * 1000).toBeGreaterThanOrEqual(SHARE_TRIM_M)
    }
  })

  it('반경보다 짧은 산책은 통째로 버린다 — 억지로 남기면 그게 집 앞 경로다', () => {
    expect(trimEnds(walkNorth(4, 20))).toEqual([]) // 약 60m
  })

  it('되돌아오는 코스(집→어딘가→집)도 양 끝이 지워진다', () => {
    const out = walkNorth(40) // 2km 북상
    const back = [...out, ...out.slice(0, -1).reverse()] // 되돌아옴
    const trimmed = trimEnds(back)
    const home = back[0]!
    for (const p of trimmed) {
      expect(haversineKm(home, p) * 1000).toBeGreaterThanOrEqual(SHARE_TRIM_M)
    }
  })

  it('점이 0~1개면 빈 배열', () => {
    expect(trimEnds([])).toEqual([])
    expect(trimEnds([{ lat: 37, lng: 127 }])).toEqual([])
  })

  it('반경을 키우면 더 많이 잘린다(설정이 실제로 먹는다)', () => {
    const pts = walkNorth(60)
    expect(trimEnds(pts, 1000).length).toBeLessThan(trimEnds(pts, 100).length)
  })
})

describe('shareablePath — 실측을 우선하되 어느 쪽이든 트림을 거친다', () => {
  it('실측 경로가 충분하면 그것을 쓴다(삐뚤빼뚤한 진짜 경로가 자랑거리다)', () => {
    const r = shareablePath(walkNorth(60), walkNorth(60, 200))
    expect(r.source).toBe('recorded')
  })

  it('실측이 없으면 장소 경로로 폴백한다', () => {
    const r = shareablePath([], walkNorth(60, 200))
    expect(r.source).toBe('places')
    expect(r.path.length).toBeGreaterThan(1)
  })

  it('폴백 경로도 트림된다 — 첫 장소가 집 근처일 수 있다', () => {
    const places = walkNorth(60, 200)
    const r = shareablePath([], places)
    for (const p of r.path) {
      expect(haversineKm(places[0]!, p) * 1000).toBeGreaterThanOrEqual(SHARE_TRIM_M)
    }
  })

  it('둘 다 너무 짧으면 경로 없음 — 카드는 숫자만 그린다', () => {
    const r = shareablePath(walkNorth(3, 10), walkNorth(2, 10))
    expect(r).toEqual({ path: [], source: 'none' })
  })
})

describe('formatTotalKm', () => {
  it('100km 이상은 정수, 미만은 소수 첫째', () => {
    expect(formatTotalKm(312.44)).toBe('312km')
    expect(formatTotalKm(8.42)).toBe('8.4km')
    expect(formatTotalKm(100)).toBe('100km')
  })
  it('0·음수·NaN은 0km', () => {
    expect(formatTotalKm(0)).toBe('0km')
    expect(formatTotalKm(-5)).toBe('0km')
    expect(formatTotalKm(Number.NaN)).toBe('0km')
  })
})
