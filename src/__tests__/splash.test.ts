import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// 스플래시는 '셸 마운트'가 아니라 '첫 의미 있는 화면'에서 걷혀야 한다.
// 예전 동작(main.tsx 렌더 직후 hide)은 스플래시 → 빈 셸/스피너 → 진짜 화면 순서를 만들어,
// 정작 감추려던 깜빡임이 스플래시가 사라진 뒤에 나왔다.

const hide = vi.fn((_opts?: unknown) => Promise.resolve())
let native = true

vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: (o?: unknown) => hide(o) } }))
vi.mock('@/lib/platform', () => ({
  isNativePlatform: () => native,
  getPlatformName: () => 'ios',
}))

const load = async () => await import('@/lib/native/splash')

describe('스플래시 걷는 시점', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    hide.mockClear()
    native = true
    const m = await load()
    m.__resetSplashForTest()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('markAppReady 전에는 걷지 않는다 — 이게 이 변경의 핵심', async () => {
    const { armSplashTimeout } = await load()
    armSplashTimeout()
    expect(hide).not.toHaveBeenCalled()
  })

  it('markAppReady가 오면 페이드와 함께 걷는다', async () => {
    const { armSplashTimeout, markAppReady } = await load()
    armSplashTimeout()
    markAppReady()
    expect(hide).toHaveBeenCalledTimes(1)
    expect(hide).toHaveBeenCalledWith({ fadeOutDuration: 200 })
  })

  it('여러 화면이 불러도 한 번만 — 로그인 뒤 앱 셸로 넘어가도 중복 호출 없음', async () => {
    const { armSplashTimeout, markAppReady } = await load()
    armSplashTimeout()
    markAppReady() // 로그인 화면
    markAppReady() // 앱 셸
    markAppReady() // 연결 화면
    expect(hide).toHaveBeenCalledTimes(1)
  })

  it('준비 신호가 끝내 안 와도 상한(3초)에서 걷는다 — 스플래시에 갇히면 앱이 죽은 것과 같다', async () => {
    const { armSplashTimeout } = await load()
    armSplashTimeout()
    vi.advanceTimersByTime(2999)
    expect(hide).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(hide).toHaveBeenCalledTimes(1)
  })

  it('markAppReady로 이미 걷혔으면 상한 타이머는 더 이상 발화하지 않는다', async () => {
    const { armSplashTimeout, markAppReady } = await load()
    armSplashTimeout()
    markAppReady()
    vi.advanceTimersByTime(10_000)
    expect(hide).toHaveBeenCalledTimes(1)
  })

  it('웹에서는 네이티브 플러그인을 건드리지 않는다(스플래시 자체가 없다)', async () => {
    native = false
    const { armSplashTimeout, markAppReady } = await load()
    armSplashTimeout()
    markAppReady()
    expect(hide).not.toHaveBeenCalled()
  })
})
