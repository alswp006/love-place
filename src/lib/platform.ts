import { Capacitor } from '@capacitor/core'

// 네이티브(Capacitor) 여부 단일 출처 — 다른 모듈은 Capacitor를 직접 import하지 않고 이 함수를 쓴다.
// 웹(브라우저/PWA)에서는 항상 false / 'web' (네이티브 브리지 부재 시 Capacitor가 그렇게 보고).
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

export function getPlatformName(): 'ios' | 'android' | 'web' {
  const p = Capacitor.getPlatform()
  return p === 'ios' || p === 'android' ? p : 'web'
}
