// 현재 위치 순수 래퍼(spec §3.5) — navigator.geolocation을 Promise로 감싸고 에러를 정규화한다.
// geo를 주입 가능하게 해서 vitest에서 모킹(테스트 용이). 권한 요청은 호출 시점(맥락 요청, security §3.1).
export type GeoResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: 'unsupported' | 'denied' | 'unavailable' | 'timeout' }

type Options = {
  geo?: Geolocation | null
  timeoutMs?: number
}

// 미지정 시 브라우저 navigator.geolocation 사용(없으면 null → unsupported).
function resolveGeo(injected: Geolocation | null | undefined): Geolocation | null {
  if (injected !== undefined) return injected
  if (typeof navigator !== 'undefined' && 'geolocation' in navigator) return navigator.geolocation
  return null
}

// GeolocationPositionError code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT.
function reasonForCode(code: number): 'denied' | 'unavailable' | 'timeout' {
  if (code === 1) return 'denied'
  if (code === 3) return 'timeout'
  return 'unavailable'
}

export function getCurrentPosition(opts: Options = {}): Promise<GeoResult> {
  const geo = resolveGeo(opts.geo)
  if (!geo) return Promise.resolve({ ok: false, reason: 'unsupported' })
  const timeout = opts.timeoutMs ?? 8000
  return new Promise<GeoResult>((resolve) => {
    geo.getCurrentPosition(
      (pos) => resolve({ ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => resolve({ ok: false, reason: reasonForCode(err.code) }),
      { enableHighAccuracy: false, timeout, maximumAge: 60_000 },
    )
  })
}
