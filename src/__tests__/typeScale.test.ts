import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 타입 스케일 램프 토큰 회귀(R4.2) — tokens.css 텍스트를 읽어 :root에
// 새 폰트 스케일/spacing 토큰이 정의됐는지 정규식으로 단언(manifest.test.ts 패턴).
const root = process.cwd()

describe('타입 스케일 램프 토큰', () => {
  let tokens: string

  beforeAll(() => {
    tokens = readFileSync(resolve(root, 'src/styles/tokens.css'), 'utf-8')
  })

  // fs 토큰은 Dynamic Type 존중을 위해 rem 상대단위여야 한다(고정 px 금지).
  it.each([
    ['--fs-h1'],
    ['--fs-h2'],
    ['--fs-label'],
    ['--fs-micro'],
  ])('%s가 rem 상대단위로 정의된다(고정 px 금지)', (name) => {
    const m = tokens.match(new RegExp(`${name}:\\s*([0-9.]+)(rem|px)`))
    expect(m, `${name} 토큰이 tokens.css에 없음`).toBeTruthy()
    expect(m?.[2]).toBe('rem')
  })

  it('--sp-5 spacing 토큰이 4→6 갭을 메운다', () => {
    expect(tokens).toMatch(/--sp-5:\s*[0-9.]+rem/)
  })
})

// 애드혹 폰트사이즈 → 토큰 램프 매핑(R4.2, Task 7) — 각 CSS 파일을 읽어
// 치환 대상 애드혹 font-size 리터럴이 더 이상 등장하지 않음을 단언(텍스트 부재 회귀).
// font-size 선언에 한정해 검사(padding/width 등 다른 속성의 동일 rem 값은 의도적 유지).
// 제외: CalendarPage `.fab 1.8rem`(글리프 렌더 크기), NaverMap 마커 글리프 px(의도적).
describe('애드혹 폰트사이즈 토큰 치환(텍스트 부재 회귀)', () => {
  const fontSizeLiteral = (css: string, value: string) =>
    new RegExp(`font-size:\\s*${value.replace('.', '\\.')}\\s*;`).test(css)

  it.each([
    ['src/components/common/EmptyState.module.css', ['2.5rem']],
    ['src/components/places/PlaceSearch.module.css', ['0.75rem']],
    ['src/components/discover/CourseSheet.module.css', ['1.1rem']],
    ['src/components/calendar/EventSheet.module.css', ['1.1rem']],
    [
      'src/pages/CalendarPage.module.css',
      ['1.3rem', '1.2rem', '0.85rem', '0.9rem', '0.7rem', '0.62rem', '0.6rem'],
    ],
  ] as const)('%s에 애드혹 font-size 리터럴이 남아있지 않다', (file, values) => {
    const css = readFileSync(resolve(root, file), 'utf-8')
    for (const v of values) {
      expect(
        fontSizeLiteral(css, v),
        `${file}에 애드혹 font-size ${v}가 토큰으로 치환되지 않고 잔존`,
      ).toBe(false)
    }
  })

  it('CalendarPage `.fab 1.8rem` 글리프 크기는 의도적으로 유지된다', () => {
    const css = readFileSync(resolve(root, 'src/pages/CalendarPage.module.css'), 'utf-8')
    expect(fontSizeLiteral(css, '1.8rem')).toBe(true)
  })
})
