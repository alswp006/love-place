import { isNativePlatform } from '@/lib/platform'
import type { PendingPoint } from './types'

// R6 네이티브 동선 recorder — transistorsoft 백그라운드 위치 래퍼. 웹/미설치는 no-op(호출측 fallback).
// 설계 §6: iOS WhenInUse(Always 회피), Android foreground-service. 업로드는 큐(pointQueue) → record_points.
// [네이티브] `npm i @transistorsoft/capacitor-background-geolocation` + cap add 후 동작(라이선스는 Android release만).

// transistorsoft Location 중 우리가 쓰는 필드.
export type BgLocation = {
  uuid?: string
  timestamp: string
  coords: { latitude: number; longitude: number; accuracy?: number; speed?: number }
}

// 플러그인 최소 인터페이스(DI로 테스트 가능 — 실제는 BackgroundGeolocation 기본 export).
// getProviderState/requestPermission은 선체크용(구버전/모킹 대비 optional).
export interface BgGeoLike {
  ready(config: Record<string, unknown>): Promise<unknown>
  start(): Promise<unknown>
  stop(): Promise<unknown>
  onLocation(cb: (loc: BgLocation) => void): { remove: () => void } | void
  getProviderState?(): Promise<{ enabled: boolean; status: number }>
  requestPermission?(): Promise<number>
  // 원샷 현재 위치(지도 '내 위치') — WebView geolocation의 origin 프롬프트/차단을 우회.
  getCurrentPosition?(opts: Record<string, unknown>): Promise<BgLocation>
}

// transistorsoft AuthorizationStatus: 3=ALWAYS, 4=WHEN_IN_USE 만 '허가'. 0/1/2=미정/제한/거부.
const AUTHORIZED = new Set([3, 4])

// 선체크 실패 시 사용자에게 보여줄 한국어 메시지(네이티브 영어 알림 대체).
export const LOCATION_SERVICES_OFF_MSG =
  '위치 서비스가 꺼져 있어요. 설정 › 개인정보 보호 및 보안 › 위치 서비스를 켠 뒤 다시 시도해주세요.'
export const LOCATION_PERMISSION_DENIED_MSG =
  '위치 권한이 필요해요. 설정에서 이 앱의 위치 접근을 “앱을 사용하는 동안”으로 허용해주세요.'

// 설계 §6 샘플링/권한 설정. desiredAccuracy 0=HIGH. WhenInUse로 Always 회피.
// disableLocationAuthorizationAlert=true: transistorsoft 기본 '영어' 권한/서비스 알림을 끈다
//   (우리가 getProviderState/requestPermission로 선체크하고 한국어 메시지를 직접 띄운다).
export const RECORDER_CONFIG: Record<string, unknown> = {
  desiredAccuracy: 0,
  distanceFilter: 15,
  locationAuthorizationRequest: 'WhenInUse',
  disableLocationAuthorizationAlert: true,
  stopOnTerminate: true,
  startOnBoot: false,
  notification: { title: '여행 동선 기록 중', text: '종료하려면 앱에서 여행 종료를 눌러주세요.' },
}

let clientSeq = 0

// 플러그인 Location → PendingPoint(순수, 테스트). client_point_id는 uuid 우선(멱등키), 없으면 timestamp+seq.
export function mapLocationToPoint(loc: BgLocation): PendingPoint {
  const id = loc.uuid ?? `${loc.timestamp}:${clientSeq++}`
  return {
    client_point_id: id,
    recorded_at: loc.timestamp,
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracy_m: loc.coords.accuracy ?? null,
    speed_mps: loc.coords.speed ?? null,
  }
}

export interface JourneyRecorder {
  // 위치 서비스/권한 선체크. 실패 시 한국어 에러 throw(호출측이 세션 생성 전에 호출 → 고아 세션 방지).
  ensureReady(): Promise<void>
  start(onPoint: (p: PendingPoint) => void): Promise<void>
  stop(): Promise<void>
  isActive(): boolean
}

// DI 가능한 recorder. plugin=null(웹/미설치)이면 no-op. 네이티브에서 onLocation→onPoint(큐 적재는 호출측).
export function createJourneyRecorder(plugin: BgGeoLike | null): JourneyRecorder {
  let sub: { remove: () => void } | void
  let active = false
  return {
    async ensureReady() {
      if (!plugin) return // 웹/미설치 — 선체크 없음(호출측 fallback)
      await plugin.ready({ ...RECORDER_CONFIG })
      // 1) 기기 위치 서비스(마스터 스위치) 꺼짐 먼저 — 꺼져 있으면 시작해도 점이 안 들어온다.
      if (plugin.getProviderState) {
        let enabled = true
        try {
          const st = await plugin.getProviderState()
          enabled = st?.enabled !== false
        } catch {
          /* 조회 실패는 서비스 판단 보류(권한 단계에서 걸러짐) */
        }
        if (!enabled) throw new Error(LOCATION_SERVICES_OFF_MSG)
      }
      // 2) 권한 요청/확인. ★ transistorsoft는 '거부' 시 status(number)로 resolve가 아니라 REJECT한다 →
      //    잡지 않으면 숫자가 그대로 던져져 호출측이 'Error 아님'으로 보고 엉뚱한 폴백 메시지를 띄운다.
      //    성공(resolve)/거부(reject) 둘 다 status로 정규화한 뒤 판정한다.
      if (plugin.requestPermission) {
        let status: number
        try {
          status = await plugin.requestPermission()
        } catch (rej) {
          status =
            typeof rej === 'number'
              ? rej
              : Number((rej as { status?: number } | null)?.status ?? 2) // 2=DENIED 기본
        }
        if (!AUTHORIZED.has(status)) throw new Error(LOCATION_PERMISSION_DENIED_MSG)
      }
    },
    async start(onPoint) {
      if (!plugin) return // 웹/미설치 — no-op
      await plugin.ready({ ...RECORDER_CONFIG })
      sub = plugin.onLocation((loc) => onPoint(mapLocationToPoint(loc)))
      await plugin.start()
      active = true
    },
    async stop() {
      if (!plugin) return
      if (sub && 'remove' in sub) sub.remove()
      await plugin.stop()
      active = false
    },
    isActive() {
      return active
    },
  }
}

// 네이티브에서만 transistorsoft 지연 로드. literal dynamic import라 Vite가 lazy 청크로 번들 →
// 런타임(웹뷰)에서 정상 해석. 웹에선 isNativePlatform()=false라 청크가 실행되지 않음(no-op).
export async function loadBgGeo(): Promise<BgGeoLike | null> {
  if (!isNativePlatform()) return null
  try {
    // 기본 export가 BackgroundGeolocation API 객체. 모듈 네임스페이스와 구조가 달라 unknown 경유 캐스팅.
    const mod = (await import('@transistorsoft/capacitor-background-geolocation')) as unknown as {
      default?: BgGeoLike
    }
    return mod.default ?? null
  } catch {
    return null
  }
}

export async function getJourneyRecorder(): Promise<JourneyRecorder> {
  return createJourneyRecorder(await loadBgGeo())
}
