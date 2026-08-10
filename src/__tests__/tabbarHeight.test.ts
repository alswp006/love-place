import { describe, it, expect, beforeEach } from 'vitest'
import { effectiveTabbarHeight, publishTabbarHeight, findTabbar } from '@/lib/layout/tabbarHeight'

// --tabbar-h는 상수 72px이었는데 실제 탭바는 기본 글자에서 58px이라 접힌 시트 아래 14px 죽은 띠가
// 남았다. 상수를 58로 바꾸는 건 오답 — 탭바 높이는 글자 크기 파생이라(100%→58, 150%→72.5,
// 200%→87) 어떤 상수도 한쪽에서 틀린다. 실측만이 답이고, 이 파일이 그 실측 규약을 지킨다.

function makeTabbar(offsetHeight: number, paddingBottom: string): HTMLElement {
  const el = document.createElement('nav')
  el.setAttribute('data-tabbar', '')
  el.style.paddingBottom = paddingBottom
  // jsdom은 레이아웃을 안 하므로 offsetHeight가 항상 0 — 실기기 값을 주입해 계산만 검증한다.
  Object.defineProperty(el, 'offsetHeight', { value: offsetHeight, configurable: true })
  document.body.appendChild(el)
  return el
}

describe('effectiveTabbarHeight', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.documentElement.style.removeProperty('--tabbar-h')
  })

  it('safe-area 패딩(=padding-bottom)을 뺀 크롬 높이를 준다 — 소비자가 safe를 따로 더하므로', () => {
    // 실측 예: iPhone 홈인디케이터 34px + 탭바 크롬 58px = offsetHeight 92px.
    // 소비자는 calc(var(--tabbar-h) + var(--safe-bottom))로 쓰므로 여기서 34를 덜어야
    // 홈인디케이터가 두 번 더해지지 않는다.
    expect(effectiveTabbarHeight(makeTabbar(92, '34px'))).toBe(58)
  })

  it('safe-area가 없는 기기(패딩 0)면 offsetHeight 그대로', () => {
    expect(effectiveTabbarHeight(makeTabbar(58, '0px'))).toBe(58)
  })

  it('글자를 키우면 탭바가 커지고 측정값도 따라 커진다(Dynamic Type)', () => {
    // 200% 글자에서 실측된 87px. 상수 72였다면 시트가 탭바를 15px 덮었을 값이다.
    expect(effectiveTabbarHeight(makeTabbar(87 + 34, '34px'))).toBe(87)
  })
})

describe('publishTabbarHeight', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.documentElement.style.removeProperty('--tabbar-h')
  })

  it('측정값을 --tabbar-h로 발행한다', () => {
    publishTabbarHeight(makeTabbar(92, '34px'))
    expect(document.documentElement.style.getPropertyValue('--tabbar-h')).toBe('58px')
  })

  it('0 이하면 발행하지 않는다 — 토큰 폴백(72px)이 살아 있어야 시트가 화면 밖으로 안 나간다', () => {
    // 레이아웃 전이거나 jsdom이면 offsetHeight가 0이다. 그때 0px을 박으면 시트 travel 계산이
    // 무너져 시트가 뷰포트 아래로 사라진다. 차라리 낡은 상수를 쓰는 편이 낫다.
    publishTabbarHeight(makeTabbar(0, '0px'))
    expect(document.documentElement.style.getPropertyValue('--tabbar-h')).toBe('')
  })

  it('요소가 없으면 조용히 넘어간다(탭바 없는 화면 — /auth, /onboarding)', () => {
    expect(() => publishTabbarHeight(null)).not.toThrow()
    expect(document.documentElement.style.getPropertyValue('--tabbar-h')).toBe('')
  })
})

describe('findTabbar', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('CSS 모듈 해시가 아니라 data-tabbar로 찾는다(클래스명이 바뀌어도 안 깨지게)', () => {
    const el = makeTabbar(92, '34px')
    el.className = '_tabbar_hashed_x7f2' // 해시가 바뀌어도 무관해야 한다
    expect(findTabbar()).toBe(el)
  })

  it('탭바가 없으면 null', () => {
    expect(findTabbar()).toBeNull()
  })
})
