// 현재 위치 순수 래퍼(spec §3.5) — navigator.geolocation을 Promise로 감싸고 에러를 정규화한다.
// geo를 주입 가능하게 해서 vitest에서 모킹(테스트 용이). 권한 요청은 호출 시점(맥락 요청, security §3.1).
export type GeoResult =
  | { ok: true; lat: number; lng: number; accuracy: number }
  | { ok: false; reason: 'unsupported' | 'denied' | 'unavailable' | 'timeout' }

type Options = {
  geo?: Geolocation | null
  timeoutMs?: number
  highAccuracy?: boolean
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

// 네이티브(Capacitor): WebView navigator.geolocation은 origin 프롬프트/차단이 얽혀 신뢰 불가 →
// 이미 설치된 bg-geo 플러그인의 원샷 getCurrentPosition을 쓴다(앱 권한 프롬프트와 자연 연동).
// 실패/미지원이면 null을 돌려 웹 경로로 폴백.
async function nativeCurrentPosition(timeoutMs: number): Promise<GeoResult | null> {
  const { isNativePlatform } = await import('@/lib/platform')
  if (!isNativePlatform()) return null
  const { loadBgGeo } = await import('@/lib/journey/recorder')
  const plugin = await loadBgGeo()
  if (!plugin?.getCurrentPosition) return null
  try {
    const loc = await plugin.getCurrentPosition({
      timeout: Math.max(1, Math.ceil(timeoutMs / 1000)), // bg-geo는 초 단위
      maximumAge: 60_000,
      desiredAccuracy: 40,
      samples: 1,
    })
    return {
      ok: true,
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? 50,
    }
  } catch (code) {
    // bg-geo LocationError: 1=TIMEOUT, 그 외(0 UNKNOWN/2 NETWORK/499 CANCELLED)는 unavailable로 정규화.
    return { ok: false, reason: code === 1 ? 'timeout' : 'unavailable' }
  }
}

export async function getCurrentPosition(opts: Options = {}): Promise<GeoResult> {
  const timeout = opts.timeoutMs ?? 8000
  // 테스트/호출측이 geo를 주입하면 그대로 웹 경로(순수성 유지). 미주입 시에만 네이티브 우선.
  if (opts.geo === undefined) {
    const native = await nativeCurrentPosition(timeout)
    if (native) return native
  }
  const geo = resolveGeo(opts.geo)
  if (!geo) return { ok: false, reason: 'unsupported' }
  return new Promise<GeoResult>((resolve) => {
    geo.getCurrentPosition(
      (pos) =>
        resolve({
          ok: true,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => resolve({ ok: false, reason: reasonForCode(err.code) }),
      { enableHighAccuracy: opts.highAccuracy ?? false, timeout, maximumAge: 60_000 },
    )
  })
}

// 자동 locate 게이트(추가 프롬프트 없이 granted일 때만, dossier 02 §4.6).
export async function getPermissionState(
  opts: { permissions?: Permissions | null } = {},
): Promise<PermissionState> {
  const perms =
    opts.permissions !== undefined
      ? opts.permissions
      : typeof navigator !== 'undefined' && 'permissions' in navigator
        ? navigator.permissions
        : null
  if (!perms) return 'prompt'
  try {
    const s = await perms.query({ name: 'geolocation' as PermissionName })
    return s.state
  } catch {
    return 'prompt' // Safari 일부 미지원 → 프롬프트 회피(자동 locate 안 함)
  }
}

/** 로드 시 자동 locate 여부 — denied만 제외. 앱 시작 기본 화면 = 내 위치(요구사항).
 * prompt 상태도 시도한다 — 지도 첫 화면은 위치 프롬프트가 맥락에 맞는 지점이고(§8 맥락 요청),
 * 네이티브 앱은 동선 기록 흐름에서 이미 위치 권한 맥락을 가진다. 순수. */
export function shouldAutoLocate(state: PermissionState): boolean {
  return state !== 'denied'
}
