import { describe, it, expect, vi, afterEach } from 'vitest'
import { haptic } from '@/lib/haptics'

const originalVibrate = Object.getOwnPropertyDescriptor(navigator, 'vibrate')

afterEach(() => {
  if (originalVibrate) {
    Object.defineProperty(navigator, 'vibrate', originalVibrate)
  } else {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })
  }
  vi.restoreAllMocks()
})

describe('haptic', () => {
  it('calls navigator.vibrate with default pattern 10 when supported', () => {
    const fn = vi.fn(() => true)
    Object.defineProperty(navigator, 'vibrate', { value: fn, configurable: true })
    expect(haptic()).toBe(true)
    expect(fn).toHaveBeenCalledWith(10)
  })

  it('calls navigator.vibrate with the provided array pattern', () => {
    const fn = vi.fn(() => true)
    Object.defineProperty(navigator, 'vibrate', { value: fn, configurable: true })
    expect(haptic([10, 30, 10])).toBe(true)
    expect(fn).toHaveBeenCalledWith([10, 30, 10])
  })

  it('returns false without throwing when vibrate is unsupported', () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })
    expect(() => haptic()).not.toThrow()
    expect(haptic()).toBe(false)
  })

  it('swallows errors thrown by vibrate and returns false', () => {
    const fn = vi.fn(() => {
      throw new Error('boom')
    })
    Object.defineProperty(navigator, 'vibrate', { value: fn, configurable: true })
    expect(() => haptic()).not.toThrow()
    expect(haptic()).toBe(false)
  })

  it('guards against undefined navigator', () => {
    // The function body checks `typeof navigator === 'undefined'`; assert the source guard
    // exists regardless of quote style after transpilation.
    expect(haptic.toString()).toMatch(/typeof navigator === ['"]undefined['"]/)
  })
})
