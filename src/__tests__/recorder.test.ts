import { describe, it, expect, vi } from 'vitest'
import {
  mapLocationToPoint,
  createJourneyRecorder,
  LOCATION_SERVICES_OFF_MSG,
  LOCATION_PERMISSION_DENIED_MSG,
  type BgGeoLike,
  type BgLocation,
} from '@/lib/journey/recorder'

function makeFake(over: Partial<BgGeoLike> = {}) {
  let cb: ((loc: BgLocation) => void) | null = null
  const remove = vi.fn()
  const plugin: BgGeoLike & { emit: (l: BgLocation) => void; _remove: typeof remove } = {
    ready: vi.fn(async () => {}),
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    onLocation: vi.fn((c) => {
      cb = c
      return { remove }
    }),
    // 기본: 서비스 켜짐 + WhenInUse 허가(4). 테스트별로 override.
    getProviderState: vi.fn(async () => ({ enabled: true, status: 4 })),
    requestPermission: vi.fn(async () => 4),
    emit: (l) => cb?.(l),
    _remove: remove,
    ...over,
  }
  return plugin
}

const loc: BgLocation = {
  uuid: 'pt-1',
  timestamp: '2026-06-27T10:00:00Z',
  coords: { latitude: 37.5, longitude: 127.0, accuracy: 8, speed: 1.2 },
}

describe('recorder — 네이티브 동선 래퍼', () => {
  it('mapLocationToPoint: 플러그인 Location → PendingPoint(uuid=멱등키)', () => {
    expect(mapLocationToPoint(loc)).toEqual({
      client_point_id: 'pt-1',
      recorded_at: '2026-06-27T10:00:00Z',
      lat: 37.5,
      lng: 127.0,
      accuracy_m: 8,
      speed_mps: 1.2,
    })
  })

  it('plugin=null(웹/미설치): ensureReady·start no-op, isActive false, throw 없음', async () => {
    const onPoint = vi.fn()
    const rec = createJourneyRecorder(null)
    await rec.ensureReady() // 웹은 선체크도 no-op(호출측 fallback)
    await rec.start(onPoint)
    expect(onPoint).not.toHaveBeenCalled()
    expect(rec.isActive()).toBe(false)
    await rec.stop() // no-op
  })

  it('ensureReady: 위치 서비스 꺼짐(enabled=false) → 한국어 에러 throw + start 미호출', async () => {
    const plugin = makeFake({ getProviderState: vi.fn(async () => ({ enabled: false, status: 4 })) })
    const rec = createJourneyRecorder(plugin)
    await expect(rec.ensureReady()).rejects.toThrow(LOCATION_SERVICES_OFF_MSG)
    expect(plugin.start).not.toHaveBeenCalled()
    expect(rec.isActive()).toBe(false)
  })

  it('ensureReady: 권한 거부(status=2 resolve) → 한국어 에러 throw', async () => {
    const plugin = makeFake({ requestPermission: vi.fn(async () => 2) })
    const rec = createJourneyRecorder(plugin)
    await expect(rec.ensureReady()).rejects.toThrow(LOCATION_PERMISSION_DENIED_MSG)
    expect(plugin.start).not.toHaveBeenCalled()
  })

  it('ensureReady: 권한 거부를 숫자로 REJECT(transistorsoft 실제 동작) → 그래도 한국어 에러', async () => {
    // transistorsoft requestPermission()은 거부 시 status 숫자로 reject한다. 정규화 못 하면
    // 숫자가 그대로 던져져 호출측이 'Error 아님'으로 보고 폴백 메시지를 띄우는 버그가 났었다.
    const plugin = makeFake({ requestPermission: vi.fn(async () => Promise.reject(2)) })
    const rec = createJourneyRecorder(plugin)
    const err = await rec.ensureReady().catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe(LOCATION_PERMISSION_DENIED_MSG)
    expect(plugin.start).not.toHaveBeenCalled()
  })

  it('ensureReady: 서비스 켜짐 + WhenInUse 허가(4) → 통과(throw 없음)', async () => {
    const plugin = makeFake()
    const rec = createJourneyRecorder(plugin)
    await expect(rec.ensureReady()).resolves.toBeUndefined()
  })

  it('네이티브: ready→onLocation→start, 위치 수신 시 onPoint(매핑됨)', async () => {
    const plugin = makeFake()
    const onPoint = vi.fn()
    const rec = createJourneyRecorder(plugin)
    await rec.start(onPoint)
    expect(plugin.ready).toHaveBeenCalledOnce()
    expect(plugin.start).toHaveBeenCalledOnce()
    expect(rec.isActive()).toBe(true)

    plugin.emit(loc)
    expect(onPoint).toHaveBeenCalledWith(
      expect.objectContaining({ client_point_id: 'pt-1', lat: 37.5, lng: 127.0 }),
    )
  })

  it('stop: 리스너 제거 + plugin.stop, isActive false', async () => {
    const plugin = makeFake()
    const rec = createJourneyRecorder(plugin)
    await rec.start(vi.fn())
    await rec.stop()
    expect(plugin._remove).toHaveBeenCalledOnce()
    expect(plugin.stop).toHaveBeenCalledOnce()
    expect(rec.isActive()).toBe(false)
  })
})
