// 탭바 실효 높이 — 상수가 아니라 **실측**이어야 하는 이유.
//
// --tabbar-h는 오랫동안 72px 상수였다. 그런데 탭바 높이는 콘텐츠에서 파생된다:
// 아이콘 24 + gap 2 + 라벨(fs-caption) + 패딩 + border-top. 그래서 사용자 글자 크기에 따라 변한다.
//
//   기본 100%  → 58px      150% → 72.5px      200% → 87px
//
// 즉 72는 "150% 글자에서만 정확하고 기본 크기에선 14px 과대"인 값이었다. 그 14px이 접힌 시트
// 아래 죽은 띠로 남았다(peek 밴드 138px인데 헤더는 124px). 상수를 58로 바꾸는 건 오답이다 —
// 큰 글자에서 시트가 탭바를 **덮는** 반대 방향 결함이 된다. 상수로는 어느 값도 옳을 수 없다.
//
// 그래서 탭바가 자기 높이를 재서 발행하고, 나머지가 그걸 읽는다.

/**
 * safe-area 패딩을 **제외한** 탭바 크롬 높이.
 *
 * 왜 빼나: 소비자가 전부 `calc(var(--tabbar-h) + var(--safe-bottom))` 꼴로 쓴다
 * (시트·백드롭·토스트·FAB 6곳). 측정값에 패딩이 섞이면 홈 인디케이터 높이가 두 번 더해진다.
 * `.tabbar`의 padding-bottom이 곧 --safe-bottom이므로 그만큼만 덜어내면 된다.
 */
export function effectiveTabbarHeight(el: HTMLElement): number {
  const pb = parseFloat(getComputedStyle(el).paddingBottom) || 0
  return Math.max(0, el.offsetHeight - pb)
}

/**
 * 측정값을 `--tabbar-h`로 발행. 0 이하면 **쓰지 않는다** — jsdom이나 레이아웃 전 시점에서
 * 0px을 박으면 시트가 화면 밖으로 나간다. 그럴 땐 tokens.css의 폴백(72px)이 계속 유효하다.
 */
export function publishTabbarHeight(el: HTMLElement | null): void {
  if (!el || typeof document === 'undefined') return
  const h = effectiveTabbarHeight(el)
  if (h <= 0) return
  document.documentElement.style.setProperty('--tabbar-h', `${h}px`)
}

/** 탭바 DOM 참조 — CSS 모듈 해시에 의존하지 않는 안정적인 선택자(`data-tabbar`). */
export function findTabbar(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.querySelector<HTMLElement>('[data-tabbar]')
}
