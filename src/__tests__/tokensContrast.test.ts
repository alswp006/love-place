import { describe, it, expect } from 'vitest'
import { contrastRatio, meetsAA, inSrgbGamut } from '@/lib/a11y/contrast'
import { readTokenThemes, resolveVar, type TokenMap } from './helpers/cssTokens'

// tokens.css를 파싱해 라이트/다크 토큰 색을 추출한다(소스 진실을 직접 게이트).
// 토큰은 OKLCH로 authoring한다 — hex만 읽던 시절 정규식은 oklch를 못 잡아 게이트가 조용히
// 빈 채로 통과했다. 그래서 hex와 oklch를 모두 잡고, 하나도 못 찾으면 실패시킨다.
//
// ⚠️ 짝은 **라이트·다크 양쪽에서 같이** 본다. 예전엔 라이트만 훑고 다크는 --ink/--surface
// 한 줄만 봤는데, 실제 사고는 다크에서 났다(--pink-600이 밝아지는데 글자가 흰색 고정).
// "라이트에서 통과했다"는 다크에 대해 아무것도 말해주지 않는다.
const { light, dark } = readTokenThemes()
const THEMES: [name: string, tokens: TokenMap][] = [
  ['라이트', light],
  ['다크', dark],
]

/** 토큰 이름 → 실제 색(var 체인 해석). 못 풀면 테스트를 실패시킨다(조용한 스킵 금지). */
function color(tokens: TokenMap, name: string): string {
  const v = tokens[name]
  expect(v, `토큰 없음: ${name}`).toBeTruthy()
  const resolved = resolveVar(v!, tokens)
  expect(resolved, `해석 실패: ${name}`).toBeTruthy()
  return resolved!
}

/** 양쪽 테마에서 반드시 본문 대비(4.5:1)를 만족해야 하는 [글자, 배경] 짝. */
const PAIRS: [fg: string, bg: string, why: string][] = [
  ['--ink', '--surface', '본문'],
  ['--ink', '--bg', '본문(배경 위)'],
  ['--ink-muted', '--surface', '보조 텍스트'],
  ['--c-cta-fg', '--c-cta-bg', 'CTA(로그인 주 버튼)'],
  ['--c-on-brand', '--c-brand', '브랜드로 채운 배지·FAB'],
  ['--c-on-brand-weak', '--pink-400', '연한 핑크 버튼'],
  ['--c-on-danger', '--c-danger', '삭제 확인 버튼'],
  ['--c-on-success', '--c-success', '가봤음 체크 배지'],
  ['--pink-ink', '--pink-100', '핑크 칩'],
  ['--danger-ink', '--danger-soft', '위험 칩'],
  ['--ok-ink', '--ok-soft', '완료 칩'],
  ['--yellow-ink', '--yellow-100', '노랑 칩'],
]

describe('tokens.css 조건부 대비 게이트(WCAG AA)', () => {
  it('토큰을 실제로 읽었다 — 파싱 실패로 빈 채 통과하지 않는다', () => {
    // 이 가드가 없으면 색 표기법이 바뀔 때 게이트 전체가 무음으로 무력화된다(실제로 겪었다).
    expect(Object.keys(light).length).toBeGreaterThan(15)
    expect(light['--ink']).toBeTruthy()
    expect(light['--surface']).toBeTruthy()
  })

  it('다크가 라이트 평탄화가 아니다 — 값이 실제로 갈린다', () => {
    expect(dark['--surface']).not.toBe(light['--surface'])
    expect(dark['--pink-600']).not.toBe(light['--pink-600'])
  })

  it('모든 OKLCH 토큰이 sRGB 색역 안 — 밖이면 브라우저가 잘라 의도한 대비가 안 나온다', () => {
    const out = [...Object.entries(light), ...Object.entries(dark)].filter(
      ([, v]) => !inSrgbGamut(v),
    )
    expect(out).toEqual([])
  })

  for (const [themeName, tokens] of THEMES) {
    it(`${themeName}: 색 짝이 전부 본문 대비(4.5:1)를 넘는다`, () => {
      const fails = PAIRS.map(([fg, bg, why]) => {
        const r = contrastRatio(color(tokens, fg), color(tokens, bg))
        return meetsAA(r, { large: false }) ? null : `${why}(${fg} on ${bg}) = ${r.toFixed(2)}:1`
      }).filter(Boolean)
      expect(fails).toEqual([])
    })

    it(`${themeName}: 트랙 3색이 같은 대비대 — 색조만 다르고 읽힘은 같아야 한다(OKLCH를 쓰는 이유)`, () => {
      const ratios = ['--c-track-mine', '--c-track-partner', '--c-track-shared'].map((t) =>
        contrastRatio(color(tokens, t), color(tokens, '--surface')),
      )
      for (const r of ratios) expect(meetsAA(r, { large: false })).toBe(true)
      expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThan(1.5)
    })
  }
})
