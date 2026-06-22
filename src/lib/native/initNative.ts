import { isNativePlatform } from '@/lib/platform'
import { StatusBar, Style } from '@capacitor/status-bar'
import { App } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'

// 네이티브(Capacitor) 셸 초기화 — 웹에선 전부 no-op. main.tsx 렌더 직후 1회 호출.
//  - 상태바: 마시멜로 라이트bg(#fff1f4)→어두운 글자(Style.Light) / 다크bg(#241016)→밝은 글자(Style.Dark).
//    setBackgroundColor는 Android 전용(iOS는 무시·실패 삼킴).
//  - 안드로이드 하드웨어 백: 뒤로 갈 수 있으면 history.back, 못 가면 앱 종료(통째로 닫힘 방지).
//  - 스플래시: 앱 셸이 떴으니 숨김(흰 깜빡임 최소화). launchAutoHide:false 전제(capacitor.config).
export function initNative(): void {
  if (!isNativePlatform()) return

  const dark =
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
  void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {})
  void StatusBar.setBackgroundColor({ color: dark ? '#241016' : '#fff1f4' }).catch(() => {})

  void App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back()
    else void App.exitApp()
  })

  void SplashScreen.hide().catch(() => {})
}
