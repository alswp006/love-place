import { useEffect } from 'react'

// 모달/바텀시트가 열린 동안 뒤 배경 스크롤을 차단한다(iOS 스크롤 체이닝 대응).
// CSS만(touch-action/overscroll-behavior)으로는 iOS WebKit이 고정 레이어 뒤 스크롤러로의
// 체이닝을 완전히 막지 못한다 → 문서 레벨 touchmove를 non-passive로 잡아
// 시트 자신의 스크롤 영역([data-sheet-scroll] 내부)만 허용하고 나머지는 preventDefault.
// 주의: 백드롭에 touch-action:none을 두면 자식 시트의 pan-y까지 무력화되므로 쓰지 않는다.
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const onTouchMove = (e: TouchEvent) => {
      const t = e.target
      if (t instanceof Element && t.closest('[data-sheet-scroll]')) return
      e.preventDefault()
    }
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => document.removeEventListener('touchmove', onTouchMove)
  }, [active])
}
