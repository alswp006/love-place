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
export interface BgGeoLike {
  ready(config: Record<string, unknown>): Promise<unknown>
  start(): Promise<unknown>
  stop(): Promise<unknown>
  onLocation(cb: (loc: BgLocation) => void): { remove: () => void } | void
}

// 설계 §6 샘플링/권한 설정. desiredAccuracy 0=HIGH. WhenInUse로 Always 회피.
export const RECORDER_CONFIG: Record<string, unknown> = {
  desiredAccuracy: 0,
  distanceFilter: 15,
  locationAuthorizationRequest: 'WhenInUse',
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
  start(onPoint: (p: PendingPoint) => void): Promise<void>
  stop(): Promise<void>
  isActive(): boolean
}

// DI 가능한 recorder. plugin=null(웹/미설치)이면 no-op. 네이티브에서 onLocation→onPoint(큐 적재는 호출측).
export function createJourneyRecorder(plugin: BgGeoLike | null): JourneyRecorder {
  let sub: { remove: () => void } | void
  let active = false
  return {
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

// 네이티브에서 transistorsoft 지연 로드. 빌드 시 정적 해석 회피(@vite-ignore + 변수 specifier),
// 미설치(cap add 전)면 try/catch로 null → no-op recorder. 웹은 항상 null.
export async function loadBgGeo(): Promise<BgGeoLike | null> {
  if (!isNativePlatform()) return null
  try {
    const spec = '@transistorsoft/capacitor-background-geolocation'
    const mod = (await import(/* @vite-ignore */ spec)) as { default?: BgGeoLike } & BgGeoLike
    return (mod.default ?? mod) as BgGeoLike
  } catch {
    return null
  }
}

export async function getJourneyRecorder(): Promise<JourneyRecorder> {
  return createJourneyRecorder(await loadBgGeo())
}
