import { describe, it, expect } from 'vitest'
import { getCurrentPosition, getPermissionState } from '@/lib/geo/currentPosition'

function geoOk(lat: number, lng: number, accuracy = 30): Geolocation {
  return {
    getCurrentPosition: (success) =>
      success({ coords: { latitude: lat, longitude: lng, accuracy } } as GeolocationPosition),
    watchPosition: () => 0,
    clearWatch: () => {},
  }
}
function geoErr(code: number): Geolocation {
  return {
    getCurrentPosition: (_s, error) => error?.({ code } as GeolocationPositionError),
    watchPosition: () => 0,
    clearWatch: () => {},
  }
}

describe('getCurrentPosition (순수 래퍼)', () => {
  it('성공 시 ok + lat/lng/accuracy를 정규화해 돌려준다', async () => {
    const r = await getCurrentPosition({ geo: geoOk(37.5, 127.0, 25) })
    expect(r).toEqual({ ok: true, lat: 37.5, lng: 127.0, accuracy: 25 })
  })

  it('미지원이면 unsupported', async () => {
    const r = await getCurrentPosition({ geo: null })
    expect(r).toEqual({ ok: false, reason: 'unsupported' })
  })

  it('권한 거부(code 1)는 denied', async () => {
    const r = await getCurrentPosition({ geo: geoErr(1) })
    expect(r).toEqual({ ok: false, reason: 'denied' })
  })

  it('위치 불가(code 2)는 unavailable', async () => {
    const r = await getCurrentPosition({ geo: geoErr(2) })
    expect(r).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('타임아웃(code 3)은 timeout', async () => {
    const r = await getCurrentPosition({ geo: geoErr(3) })
    expect(r).toEqual({ ok: false, reason: 'timeout' })
  })
})

describe('getPermissionState (자동 locate 게이트)', () => {
  it('permissions 미지원이면 prompt(자동 locate 안 함)', async () => {
    expect(await getPermissionState({ permissions: null })).toBe('prompt')
  })
  it('granted면 granted', async () => {
    const permissions = { query: async () => ({ state: 'granted' }) } as unknown as Permissions
    expect(await getPermissionState({ permissions })).toBe('granted')
  })
  it('query throw(Safari 등)면 prompt 폴백', async () => {
    const permissions = {
      query: async () => {
        throw new Error('no')
      },
    } as unknown as Permissions
    expect(await getPermissionState({ permissions })).toBe('prompt')
  })
})
