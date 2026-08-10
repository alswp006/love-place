import { SplashScreen } from '@capacitor/splash-screen'
import { isNativePlatform } from '@/lib/platform'

// 스플래시를 **언제** 걷는가.
//
// 예전엔 initNative()가 main.tsx 렌더 직후 곧바로 hide()를 불렀다. 그런데 그 시점엔 아직
// 아무것도 준비돼 있지 않다 — 세션 확인 전이고, 커플 조회 전이고, 첫 화면은 RouteFallback이다.
// 결과:
//
//     스플래시(≈0.2초) → 빈 셸/스피너 → 진짜 화면
//
// 스플래시를 둔 목적이 "흰 깜빡임 최소화"였는데, 정작 그 깜빡임 구간이 스플래시가 사라진 **뒤에**
// 왔다. 사용자에겐 "스플래시가 너무 짧게 뜬다"로 보인다 — 짧은 게 문제가 아니라 제 역할을 못 한 것.
//
// 그래서 신호를 뒤집는다: 첫 **의미 있는** 화면이 마운트될 때 markAppReady()를 부르고, 그때 걷는다.
// 다만 무한정 붙잡으면 로딩이 실패했을 때 앱이 스플래시에 갇히므로 상한을 함께 둔다.

/** 준비 신호가 끝내 오지 않아도 여기서는 반드시 걷는다(네트워크 실패·예외 등). */
const CAP_MS = 3000
/** hide() 페이드 — 즉시 사라지면 전환이 끊겨 보인다. */
const FADE_MS = 200

let hidden = false
let capTimer: ReturnType<typeof setTimeout> | null = null

function hideNow(): void {
  if (hidden) return
  hidden = true
  if (capTimer !== null) {
    clearTimeout(capTimer)
    capTimer = null
  }
  if (!isNativePlatform()) return // 웹엔 네이티브 스플래시가 없다
  void SplashScreen.hide({ fadeOutDuration: FADE_MS }).catch(() => {})
}

/**
 * 첫 의미 있는 화면이 마운트됐다 — 스플래시를 걷는다.
 * 여러 화면에서 불려도(로그인/앱셸/연결) 처음 한 번만 동작한다.
 */
export function markAppReady(): void {
  hideNow()
}

/** 상한 타이머 무장. initNative()가 앱 시작 시 1회 호출한다. */
export function armSplashTimeout(ms: number = CAP_MS): void {
  if (hidden || capTimer !== null) return
  capTimer = setTimeout(hideNow, ms)
}

/** 테스트 전용 — 모듈 스코프 상태를 초기화한다. */
export function __resetSplashForTest(): void {
  hidden = false
  if (capTimer !== null) clearTimeout(capTimer)
  capTimer = null
}
