import { haversineKm } from '@/lib/recap/recapStats'
import type { PendingPoint } from './types'
import type { JourneyRecorder } from './recorder'

// 웹(브라우저·PWA)용 동선 recorder — navigator.geolocation.watchPosition.
//
// 왜 만들었나: 웹에서는 네이티브 플러그인이 없어 recorder가 통째로 no-op이었다. 그런데 UI는
// 그대로 "기록 중" 배지를 켰고 DB에도 RECORDING 세션이 생겼다. 즉 **성공한 척하는 실패**였다 —
// 여행 내내 켜 두고 돌아와서야 점 0개·거리 0m라는 걸 알게 된다. 실패보다 나쁘다.
//
// 한계를 분명히 하고 시작한다: iOS Safari는 화면이 꺼지거나 탭이 백그라운드로 가면 JS 타이머와
// 위치 콜백을 정지시킨다. 그래서 이 recorder는 **화면을 켜 두고 앱을 보고 있는 동안**만 기록한다.
// 주머니에 넣고 걷는 건 네이티브 앱(백그라운드 위치 권한)이 있어야 한다.
// 그래도 반쪽이 0보다 낫고, 무엇보다 UI가 거짓말을 하지 않게 된다.

/** 이 거리(m)만큼 움직여야 점을 하나 남긴다. 네이티브 RECORDER_CONFIG.distanceFilter와 맞춘다. */
export const WEB_DISTANCE_FILTER_M = 15

/** 이보다 부정확한 점은 버린다 — 실내·터널에서 수백 m짜리 점이 들어와 동선을 망친다. */
export const WEB_MAX_ACCURACY_M = 100

export const WEB_LOCATION_UNAVAILABLE_MSG =
  '이 브라우저에서는 위치를 쓸 수 없어요. 홈 화면에 추가한 앱이나 최신 브라우저에서 다시 시도해 주세요.'
export const WEB_LOCATION_DENIED_MSG =
  '위치 권한이 필요해요. 브라우저 설정에서 이 사이트의 위치 접근을 허용해 주세요.'

/** 웹 recorder가 걸린 상태에서 사용자에게 반드시 알려야 하는 한계. UI가 그대로 보여준다. */
export const WEB_RECORDING_CAVEAT = '화면을 켜 둔 동안만 기록돼요'

type Geo = Pick<Geolocation, 'watchPosition' | 'clearWatch' | 'getCurrentPosition'>

/** GeolocationPosition → PendingPoint. seq는 같은 밀리초에 두 점이 와도 키가 겹치지 않게. */
export function mapWebPosition(pos: GeolocationPosition, seq: number): PendingPoint {
  const recordedAt = new Date(pos.timestamp).toISOString()
  return {
    // 서버가 client_point_id로 멱등 처리한다(중복 전송해도 한 번만 저장).
    client_point_id: `w:${pos.timestamp}:${seq}`,
    recorded_at: recordedAt,
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy_m: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
    speed_mps: pos.coords.speed != null && Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
  }
}

/**
 * 이 점을 남길지 판단(순수 — 테스트로 못박음).
 *
 * 첫 점은 언제나 남긴다. 이후는 직전 점에서 distanceFilter만큼 움직였을 때만.
 * 정확도가 나쁜 점은 거리 계산까지 오염시키므로 먼저 버린다.
 */
export function shouldKeep(
  prev: { lat: number; lng: number } | null,
  next: { lat: number; lng: number; accuracy_m?: number | null },
  distanceFilterM = WEB_DISTANCE_FILTER_M,
  maxAccuracyM = WEB_MAX_ACCURACY_M,
): boolean {
  const acc = next.accuracy_m
  if (acc != null && Number.isFinite(acc) && acc > maxAccuracyM) return false
  if (!prev) return true
  return haversineKm(prev, next) * 1000 >= distanceFilterM
}

/** 권한 상태를 미리 볼 수 있으면 본다. 미지원 브라우저면 'unknown'(watchPosition이 물어본다). */
async function peekPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  try {
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions
    if (!perms?.query) return 'unknown'
    const st = await perms.query({ name: 'geolocation' as PermissionName })
    return st.state
  } catch {
    return 'unknown'
  }
}

/**
 * 웹 recorder. plugin이 없을 때 getJourneyRecorder()가 이걸 준다.
 * geo를 주입받는 이유는 테스트 때문이다(jsdom에는 geolocation이 없다).
 */
export function createWebRecorder(geo: Geo | null): JourneyRecorder {
  let watchId: number | null = null
  let last: { lat: number; lng: number } | null = null
  let seq = 0

  return {
    async ensureReady() {
      if (!geo) throw new Error(WEB_LOCATION_UNAVAILABLE_MSG)
      // 세션을 만들기 **전에** 거절을 알아야 고아 RECORDING 세션이 안 남는다(네이티브와 같은 계약).
      if ((await peekPermission()) === 'denied') throw new Error(WEB_LOCATION_DENIED_MSG)
    },

    async start(onPoint: (p: PendingPoint) => void) {
      if (!geo) throw new Error(WEB_LOCATION_UNAVAILABLE_MSG)
      last = null
      await new Promise<void>((resolve, reject) => {
        let settled = false
        // ⚠️ 에러 콜백이 **watchPosition이 반환하기 전에** 불릴 수 있다(권한이 이미 거부된 경우 등).
        //    그러면 watchId가 아직 없어서 clearWatch를 못 하고 watch가 샌다.
        //    그래서 '아직 id를 모르는 상태에서 실패했다'를 따로 기록하고, 반환 직후에 정리한다.
        let failedBeforeId = false
        const id = geo.watchPosition(
          (pos) => {
            // 첫 콜백이 곧 "권한 허용 + 위치 수신 시작" 신호다 — 그때 start()를 성공으로 확정한다.
            if (!settled) {
              settled = true
              resolve()
            }
            const point = mapWebPosition(pos, seq++)
            if (!shouldKeep(last, point)) return
            last = { lat: point.lat, lng: point.lng }
            onPoint(point)
          },
          (err) => {
            if (settled) return // 기록 중 일시적 실패는 삼킨다(터널 하나에 여행 기록이 끊기면 안 된다)
            settled = true
            if (watchId != null) {
              geo.clearWatch(watchId)
              watchId = null
            } else {
              failedBeforeId = true
            }
            reject(
              new Error(err.code === err.PERMISSION_DENIED ? WEB_LOCATION_DENIED_MSG : WEB_LOCATION_UNAVAILABLE_MSG),
            )
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
        )
        if (failedBeforeId) geo.clearWatch(id)
        else watchId = id
      })
    },

    async stop() {
      if (!geo || watchId == null) return
      geo.clearWatch(watchId)
      watchId = null
      last = null
    },

    isActive() {
      return watchId != null
    },
  }
}
