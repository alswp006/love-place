import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, afterEach } from 'vitest'
import { readPxVar } from '@/lib/layout/cssOffsets'

// Task 8: 하단 오프셋 단일화 — --tabbar-h/--sheet-peek-h 단일출처(매직넘버 제거).
describe('readPxVar', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--tabbar-h')
    document.documentElement.style.removeProperty('--sheet-peek-h')
  })

  it("'72px' 토큰을 숫자 72로 파싱", () => {
    document.documentElement.style.setProperty('--tabbar-h', '72px')
    expect(readPxVar('--tabbar-h', 0)).toBe(72)
  })

  it('미정의 토큰(빈 문자)은 fallback 반환', () => {
    expect(readPxVar('--does-not-exist', 128)).toBe(128)
  })

  it('NaN/비숫자 값은 fallback 반환', () => {
    document.documentElement.style.setProperty('--tabbar-h', 'auto')
    expect(readPxVar('--tabbar-h', 99)).toBe(99)
  })
})

function readCss(rel: string): string {
  const url = new URL(rel, import.meta.url)
  return readFileSync(fileURLToPath(url), 'utf8')
}

// 매직넘버 회귀 단언 — raw px 리터럴이 다시 들어오지 못하게(토큰 단일출처).
describe('하단 오프셋 매직넘버 회귀', () => {
  it('PlaceSearch.module.css에 raw 72px 미등장', () => {
    expect(readCss('../components/places/PlaceSearch.module.css')).not.toMatch(/72px/)
  })

  it('ToastProvider.module.css에 raw 88px 미등장', () => {
    expect(readCss('../components/common/ToastProvider.module.css')).not.toMatch(/88px/)
  })

  it('CalendarPage.module.css .fab에 raw 76px 미등장', () => {
    expect(readCss('../pages/CalendarPage.module.css')).not.toMatch(/76px/)
  })
})
