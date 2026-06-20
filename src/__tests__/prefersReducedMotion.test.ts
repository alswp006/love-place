import { describe, it, expect, afterEach, vi } from 'vitest'
import { prefersReducedMotion } from '@/lib/motion/prefersReducedMotion'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('prefersReducedMotion', () => {
  it('returns true when matchMedia reports reduce preference', () => {
    const matchMedia = vi.fn(() => ({ matches: true }))
    vi.stubGlobal('matchMedia', matchMedia)
    expect(prefersReducedMotion()).toBe(true)
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
  })

  it('returns false when matchMedia reports no reduce preference', () => {
    const matchMedia = vi.fn(() => ({ matches: false }))
    vi.stubGlobal('matchMedia', matchMedia)
    expect(prefersReducedMotion()).toBe(false)
  })

  it('returns false (no throw) when window.matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(() => prefersReducedMotion()).not.toThrow()
    expect(prefersReducedMotion()).toBe(false)
  })
})
