import { describe, it, expect, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useScrollLock } from '@/hooks/useScrollLock'

// iOS 모달 뒤 배경 스크롤 차단 — 문서 touchmove를 잡되 [data-sheet-scroll] 내부만 허용.
function fireTouchMove(target: Element): boolean {
  const e = new Event('touchmove', { bubbles: true, cancelable: true })
  target.dispatchEvent(e)
  return e.defaultPrevented
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useScrollLock — 모달 열림 동안 배경 터치 스크롤 차단', () => {
  it('활성일 때 시트 밖 touchmove는 preventDefault(배경 스크롤 차단)', () => {
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    renderHook(() => useScrollLock(true))
    expect(fireTouchMove(outside)).toBe(true)
  })

  it('[data-sheet-scroll] 내부 touchmove는 허용(시트 자체 스크롤 유지)', () => {
    const scroller = document.createElement('div')
    scroller.setAttribute('data-sheet-scroll', '')
    const inner = document.createElement('p')
    scroller.appendChild(inner)
    document.body.appendChild(scroller)
    renderHook(() => useScrollLock(true))
    expect(fireTouchMove(inner)).toBe(false)
  })

  it('비활성/언마운트 시 차단하지 않음(리스너 정리)', () => {
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    const inactive = renderHook(() => useScrollLock(false))
    expect(fireTouchMove(outside)).toBe(false)
    inactive.unmount()

    const active = renderHook(() => useScrollLock(true))
    expect(fireTouchMove(outside)).toBe(true)
    active.unmount()
    expect(fireTouchMove(outside)).toBe(false)
  })
})
