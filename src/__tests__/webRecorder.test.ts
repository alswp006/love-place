import { describe, it, expect, vi } from 'vitest'
import {
  createWebRecorder,
  mapWebPosition,
  shouldKeep,
  WEB_DISTANCE_FILTER_M,
  WEB_LOCATION_DENIED_MSG,
  WEB_LOCATION_UNAVAILABLE_MSG,
} from '@/lib/journey/webRecorder'

// 웹 동선 기록.
//
// 이 파일이 지키는 계약은 하나다: **성공한 척하는 실패를 만들지 않는다.**
// 예전 웹 recorder는 플러그인이 없으면 start()가 그냥 return했다. 그런데 호출측은 성공으로 보고
// RECORDING 세션을 만들고 '기록 중' 배지를 켰다. 여행 내내 켜 두고 돌아와서야 점 0개를 발견한다.
// 그래서 이제는 못 하면 **던진다**.

function position(lat: number, lng: number, accuracy = 10, t = 1_700_000_000_000): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: t,
    toJSON: () => ({}),
  } as unknown as GeolocationPosition
}

describe('shouldKeep — 점을 남길지', () => {
  it('첫 점은 언제나 남긴다', () => {
    expect(shouldKeep(null, { lat: 37.5, lng: 127.0 })).toBe(true)
  })

  it(`${WEB_DISTANCE_FILTER_M}m 미만 이동은 버린다 — 서 있어도 GPS는 계속 흔들린다`, () => {
    const prev = { lat: 37.5, lng: 127.0 }
    // 약 5m 북쪽(위도 1e-4 ≈ 11m)
    expect(shouldKeep(prev, { lat: 37.50005, lng: 127.0 })).toBe(false)
  })

  it('충분히 움직이면 남긴다', () => {
    const prev = { lat: 37.5, lng: 127.0 }
    // 약 33m 북쪽
    expect(shouldKeep(prev, { lat: 37.5003, lng: 127.0 })).toBe(true)
  })

  it('정확도가 나쁜 점은 거리와 무관하게 버린다 — 동선을 통째로 망친다', () => {
    expect(shouldKeep(null, { lat: 37.5, lng: 127.0, accuracy_m: 500 })).toBe(false)
    expect(shouldKeep({ lat: 37.5, lng: 127.0 }, { lat: 38, lng: 128, accuracy_m: 300 })).toBe(false)
  })

  it('정확도를 모르면(null) 통과시킨다 — 없는 값을 나쁘다고 단정하지 않는다', () => {
    expect(shouldKeep(null, { lat: 37.5, lng: 127.0, accuracy_m: null })).toBe(true)
  })
})

describe('mapWebPosition', () => {
  it('좌표·시각·정확도를 옮기고 멱등키를 만든다', () => {
    const p = mapWebPosition(position(37.5, 127.0, 12, 1_700_000_000_000), 3)
    expect(p.lat).toBe(37.5)
    expect(p.lng).toBe(127.0)
    expect(p.accuracy_m).toBe(12)
    expect(p.recorded_at).toBe(new Date(1_700_000_000_000).toISOString())
    // 서버가 client_point_id로 중복을 걸러낸다 — 같은 밀리초에 두 점이 와도 키가 겹치면 안 된다.
    expect(p.client_point_id).toBe('w:1700000000000:3')
    expect(mapWebPosition(position(37.5, 127.0, 12, 1_700_000_000_000), 4).client_point_id).not.toBe(
      p.client_point_id,
    )
  })
})

describe('createWebRecorder — 못 하면 던진다(조용히 성공하지 않는다)', () => {
  it('geolocation이 없으면 ensureReady가 거절한다 — 세션이 만들어지기 전에', async () => {
    const rec = createWebRecorder(null)
    await expect(rec.ensureReady()).rejects.toThrow(WEB_LOCATION_UNAVAILABLE_MSG)
  })

  it('geolocation이 없으면 start도 던진다 — 예전엔 여기서 조용히 return했다', async () => {
    const rec = createWebRecorder(null)
    await expect(rec.start(() => {})).rejects.toThrow(WEB_LOCATION_UNAVAILABLE_MSG)
    expect(rec.isActive()).toBe(false)
  })

  it('권한 거부는 사람 말로 던지고 watch를 정리한다', async () => {
    const clearWatch = vi.fn()
    const geo = {
      watchPosition: (_ok: PositionCallback, err?: PositionErrorCallback | null) => {
        err?.({ code: 1, PERMISSION_DENIED: 1, message: '' } as unknown as GeolocationPositionError)
        return 7
      },
      clearWatch,
      getCurrentPosition: vi.fn(),
    }
    const rec = createWebRecorder(geo)
    await expect(rec.start(() => {})).rejects.toThrow(WEB_LOCATION_DENIED_MSG)
    expect(clearWatch).toHaveBeenCalledWith(7)
    expect(rec.isActive()).toBe(false)
  })
})

describe('createWebRecorder — 실제로 점을 흘린다', () => {
  /** watchPosition 콜백을 테스트가 직접 호출할 수 있는 가짜 geolocation. */
  function fakeGeo() {
    let cb: PositionCallback | null = null
    const clearWatch = vi.fn()
    const geo = {
      watchPosition: (ok: PositionCallback) => {
        cb = ok
        return 1
      },
      clearWatch,
      getCurrentPosition: vi.fn(),
    }
    return { geo, emit: (p: GeolocationPosition) => cb?.(p), clearWatch }
  }

  it('첫 위치를 받으면 start가 완료되고, 이후 이동한 점만 올라간다', async () => {
    const { geo, emit } = fakeGeo()
    const rec = createWebRecorder(geo)
    const points: { lat: number; lng: number }[] = []

    const started = rec.start((p) => points.push({ lat: p.lat, lng: p.lng }))
    emit(position(37.5, 127.0)) // 첫 점 = 시작 확정 + 기록
    await started

    expect(rec.isActive()).toBe(true)
    emit(position(37.50005, 127.0)) // ~5m — 버림
    emit(position(37.5003, 127.0)) // ~33m — 기록
    emit(position(37.5003, 127.0)) // 제자리 — 버림

    expect(points).toHaveLength(2)
    expect(points[1]!.lat).toBeCloseTo(37.5003, 6)
  })

  it('stop 후에는 활성이 아니고, 다시 시작하면 첫 점을 새로 남긴다', async () => {
    const { geo, emit, clearWatch } = fakeGeo()
    const rec = createWebRecorder(geo)
    const points: unknown[] = []

    const started = rec.start(() => points.push(1))
    emit(position(37.5, 127.0))
    await started
    await rec.stop()
    expect(clearWatch).toHaveBeenCalled()
    expect(rec.isActive()).toBe(false)

    const again = rec.start(() => points.push(1))
    emit(position(37.5, 127.0)) // 같은 자리지만 '첫 점'이므로 남는다
    await again
    expect(points).toHaveLength(2)
  })

  it('기록 중 일시적 위치 실패는 삼킨다 — 터널 하나에 여행 기록이 끊기면 안 된다', async () => {
    let ok: PositionCallback | null = null
    let fail: PositionErrorCallback | null = null
    const geo = {
      watchPosition: (o: PositionCallback, e?: PositionErrorCallback | null) => {
        ok = o
        fail = e ?? null
        return 2
      },
      clearWatch: vi.fn(),
      getCurrentPosition: vi.fn(),
    }
    const rec = createWebRecorder(geo)
    const points: unknown[] = []
    const started = rec.start(() => points.push(1))
    ok!(position(37.5, 127.0))
    await started

    // 시작이 확정된 뒤의 에러는 던지지 않는다(다음 콜백에서 회복).
    expect(() => fail!({ code: 2, PERMISSION_DENIED: 1, message: '' } as unknown as GeolocationPositionError)).not.toThrow()
    expect(rec.isActive()).toBe(true)
    ok!(position(37.5003, 127.0))
    expect(points).toHaveLength(2)
  })
})
