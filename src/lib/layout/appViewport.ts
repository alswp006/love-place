// 단일 dvh 소스(research 01 §15.5) — JS가 측정한 뷰포트 높이로 --app-vh를 설정하고,
// 시트 translateY·지도 인셋·플로팅 버튼이 모두 이 한 값에서 도출되게 한다(CSS dvh vs JS innerHeight 불일치 제거).

/** 시트가 이동할 수 있는 실효 높이 = 측정 vh − 탭바 − 하단 safe-area. 음수는 0으로 클램프(순수). */
export function sheetTravelHeight(vh: number, tabbarH: number, safeBottom: number): number {
  return Math.max(0, vh - tabbarH - safeBottom)
}

/** 측정한 innerHeight를 --app-vh(px)로 문서 루트에 반영. CSS(peek)·JS(translate)가 같은 값을 읽는다. */
export function setAppVh(vh: number): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--app-vh', `${vh}px`)
}
