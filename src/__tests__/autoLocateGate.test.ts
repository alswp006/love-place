import { describe, it, expect } from 'vitest'
import { shouldAutoLocate } from '@/lib/geo/currentPosition'

describe('shouldAutoLocate (로드 시 자동 locate — 앱 시작 기본은 내 위치)', () => {
  it('granted면 자동 locate', () => {
    expect(shouldAutoLocate('granted')).toBe(true)
  })
  it('prompt도 자동 locate(지도 첫 화면 = 맥락에 맞는 권한 요청 지점)', () => {
    expect(shouldAutoLocate('prompt')).toBe(true)
  })
  it('denied면 자동 안 함', () => {
    expect(shouldAutoLocate('denied')).toBe(false)
  })
})
