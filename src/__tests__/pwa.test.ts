import { describe, it, expect, vi, beforeEach } from 'vitest'

const registerSW = vi.fn()
vi.mock('virtual:pwa-register', () => ({ registerSW }))
const platform = vi.hoisted(() => ({ native: false }))
vi.mock('@/lib/platform', () => ({ isNativePlatform: () => platform.native }))

import { registerPwa } from '@/lib/pwa'

describe('registerPwa — 네이티브 게이트', () => {
  beforeEach(() => registerSW.mockClear())

  it('웹에서는 서비스워커를 등록한다', async () => {
    platform.native = false
    await registerPwa()
    expect(registerSW).toHaveBeenCalledTimes(1)
  })

  it('네이티브(Capacitor)에서는 등록하지 않는다(로컬 자산 충돌 방지)', async () => {
    platform.native = true
    await registerPwa()
    expect(registerSW).not.toHaveBeenCalled()
  })
})
