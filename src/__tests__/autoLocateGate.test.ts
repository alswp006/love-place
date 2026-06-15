import { describe, it, expect } from 'vitest'
import { shouldAutoLocate } from '@/lib/geo/currentPosition'

describe('shouldAutoLocate (로드 시 자동 locate 결정 — 추가 프롬프트 금지)', () => {
  it('granted면 자동 locate', () => {
    expect(shouldAutoLocate('granted')).toBe(true)
  })
  it('prompt면 자동 안 함(사용자 📍 탭에서만)', () => {
    expect(shouldAutoLocate('prompt')).toBe(false)
  })
  it('denied면 자동 안 함', () => {
    expect(shouldAutoLocate('denied')).toBe(false)
  })
})
