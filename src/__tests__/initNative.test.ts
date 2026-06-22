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

  it('네이티브: 상태바 스타일·배경 설정, backButton 등록, 스플래시 숨김', () => {
    platform.native = true
    initNative()
    expect(setStyle).toHaveBeenCalledTimes(1)
    expect(setBg).toHaveBeenCalledTimes(1)
    expect(addListener).toHaveBeenCalledWith('backButton', expect.any(Function))
    expect(splashHide).toHaveBeenCalledTimes(1)
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
