import { describe, it, expect, vi, beforeEach } from 'vitest'

const platform = vi.hoisted(() => ({ native: true }))
const setStyle = vi.hoisted(() => vi.fn(async () => {}))
const setBg = vi.hoisted(() => vi.fn(async () => {}))
const addListener = vi.hoisted(() => vi.fn())
const splashHide = vi.hoisted(() => vi.fn(async () => {}))
const exitApp = vi.hoisted(() => vi.fn())

vi.mock('@/lib/platform', () => ({ isNativePlatform: () => platform.native }))
vi.mock('@capacitor/status-bar', () => ({
  StatusBar: { setStyle, setBackgroundColor: setBg },
  Style: { Light: 'LIGHT', Dark: 'DARK' },
}))
vi.mock('@capacitor/app', () => ({ App: { addListener, exitApp } }))
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: splashHide } }))

import { initNative } from '@/lib/native/initNative'

describe('initNative — 네이티브 셸 초기화', () => {
  beforeEach(() => {
    setStyle.mockClear()
    setBg.mockClear()
    addListener.mockClear()
    splashHide.mockClear()
    exitApp.mockClear()
  })

  it('네이티브: 상태바 스타일·배경 설정, backButton 등록', () => {
    platform.native = true
    initNative()
    expect(setStyle).toHaveBeenCalledTimes(1)
    expect(setBg).toHaveBeenCalledTimes(1)
    expect(addListener).toHaveBeenCalledWith('backButton', expect.any(Function))
  })

  it('★ 스플래시를 여기서 걷지 않는다 — 셸이 떴을 뿐 첫 화면은 아직 준비 전이다', () => {
    // 예전엔 여기서 곧바로 hide()를 불렀다. 그러면 세션 확인·커플 조회가 끝나기 전이라
    // 스플래시(0.2초) → 빈 셸/스피너 → 진짜 화면 순서가 되어, 감추려던 깜빡임이 스플래시가
    // 사라진 뒤에 나왔다("스플래시가 너무 짧게 뜬다"의 정체).
    // 이제 첫 의미 있는 화면이 markAppReady()를 부르고, 안 오면 상한 타이머가 걷는다.
    // 자세한 계약은 splash.test.ts.
    platform.native = true
    initNative()
    expect(splashHide).not.toHaveBeenCalled()
  })

  it('안드로이드 백: canGoBack=false면 앱 종료(통째로 닫힘 방지)', () => {
    platform.native = true
    initNative()
    const handler = addListener.mock.calls[0]![1] as (e: { canGoBack: boolean }) => void
    handler({ canGoBack: false })
    expect(exitApp).toHaveBeenCalledTimes(1)
  })

  it('웹: 전부 no-op', () => {
    platform.native = false
    initNative()
    expect(setStyle).not.toHaveBeenCalled()
    expect(addListener).not.toHaveBeenCalled()
    expect(splashHide).not.toHaveBeenCalled()
  })
})
