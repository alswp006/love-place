import { isNativePlatform } from './platform'

// PWA 서비스워커 등록 — 브라우저에서만. 네이티브(Capacitor)는 로컬 번들 자산을 직접 서빙하므로
// SW를 등록하면 자산/캐시가 충돌한다(빈 화면·스테일 캐시 위험) → 등록하지 않는다.
export async function registerPwa(): Promise<void> {
  if (isNativePlatform()) return
  const { registerSW } = await import('virtual:pwa-register')
  registerSW({ immediate: true })
}
