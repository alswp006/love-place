import { isNativePlatform } from '@/lib/platform'
import { StatusBar, Style } from '@capacitor/status-bar'
import { App } from '@capacitor/app'
import { armSplashTimeout } from '@/lib/native/splash'

// 네이티브(Capacitor) 셸 초기화 — 웹에선 전부 no-op. main.tsx 렌더 직후 1회 호출.
//  - 상태바: 마시멜로 라이트bg(#fff1f4)→어두운 글자(Style.Light) / 다크bg(#241016)→밝은 글자(Style.Dark).
//    setBackgroundColor는 Android 전용(iOS는 무시·실패 삼킴).
//  - 안드로이드 하드웨어 백: 뒤로 갈 수 있으면 history.back, 못 가면 앱 종료(통째로 닫힘 방지).
//  - 스플래시: 여기선 상한 타이머만 무장. 실제로 걷는 시점은 lib/native/splash.ts 참조.
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

  // 스플래시는 여기서 걷지 않는다 — 셸이 마운트됐을 뿐 첫 화면은 아직 준비 전이다.
  // 첫 의미 있는 화면이 markAppReady()를 부르고, 그게 끝내 안 오면 이 상한 타이머가 걷는다.
  armSplashTimeout()
}
