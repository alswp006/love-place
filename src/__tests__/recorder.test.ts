import { describe, it, expect, vi } from 'vitest'
import {
  mapLocationToPoint,
  createJourneyRecorder,
  type BgGeoLike,
  type BgLocation,
} from '@/lib/journey/recorder'

function makeFake() {
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
    emit: (l) => cb?.(l),
    _remove: remove,
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

  it('plugin=null(웹/미설치): start no-op, isActive false, throw 없음', async () => {
    const onPoint = vi.fn()
    const rec = createJourneyRecorder(null)
    await rec.start(onPoint)
    expect(onPoint).not.toHaveBeenCalled()
    expect(rec.isActive()).toBe(false)
    await rec.stop() // no-op
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
