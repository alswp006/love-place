import { describe, it, expect } from 'vitest'
import { isNativePlatform, getPlatformName } from '@/lib/platform'

// jsdom(웹)에는 Capacitor 네이티브 브리지가 없으므로 항상 web으로 도출돼야 한다.
describe('platform 래퍼', () => {
  it('웹(jsdom)에서 isNativePlatform()은 false', () => {
    expect(isNativePlatform()).toBe(false)
  })
  it('웹에서 getPlatformName()은 "web"', () => {
    expect(getPlatformName()).toBe('web')
  })
})
