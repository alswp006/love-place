import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { contrastRatio, meetsAA, inSrgbGamut } from '@/lib/a11y/contrast'

// tokens.css를 파싱해 라이트/다크 토큰 색을 추출한다(소스 진실을 직접 게이트).
// 토큰은 OKLCH로 authoring한다 — hex만 읽던 시절 정규식은 oklch를 못 잡아 게이트가 조용히
// 빈 채로 통과했다. 그래서 hex와 oklch를 모두 잡고, 하나도 못 찾으면 실패시킨다.
// vitest는 cwd가 repo 루트 — import.meta.url이 file:// 스킴이 아닐 수 있어 cwd 기준 경로로 읽는다.
const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
function extract(scope: string): Record<string, string> {
  const m: Record<string, string> = {}
  for (const line of scope.split('\n')) {
    const hit = line.match(/(--[\w-]+):\s*(#[0-9a-fA-F]{6}|oklch\([^;]+?\))\s*;/)
    if (hit) m[hit[1]!] = hit[2]!
  }
  return m
}
const darkAt = css.indexOf('@media (prefers-color-scheme: dark)')
const light = extract(css.slice(css.indexOf(':root'), darkAt))
const dark = { ...light, ...extract(css.slice(darkAt)) } // 다크는 라이트 위 override

describe('tokens.css 조건부 대비 게이트(WCAG AA)', () => {
  it('토큰을 실제로 읽었다 — 파싱 실패로 빈 채 통과하지 않는다', () => {
    // 이 가드가 없으면 색 표기법이 바뀔 때 게이트 전체가 무음으로 무력화된다(실제로 겪었다).
    expect(Object.keys(light).length).toBeGreaterThan(15)
    expect(light['--ink']).toBeTruthy()
    expect(light['--surface']).toBeTruthy()
  })

  it('모든 OKLCH 토큰이 sRGB 색역 안 — 밖이면 브라우저가 잘라 의도한 대비가 안 나온다', () => {
    const out = [...Object.entries(light), ...Object.entries(dark)].filter(
      ([, v]) => !inSrgbGamut(v),
    )
    expect(out).toEqual([])
  })

  it('라이트: --ink on --surface, --bg 본문 통과', () => {
    expect(meetsAA(contrastRatio(light['--ink']!, light['--surface']!), { large: false })).toBe(true)
    expect(meetsAA(contrastRatio(light['--ink']!, light['--bg']!), { large: false })).toBe(true)
  })
  it('라이트: --ink-muted on --surface 본문 통과(보정값)', () => {
    expect(meetsAA(contrastRatio(light['--ink-muted']!, light['--surface']!), { large: false })).toBe(true)
  })
  it('라이트: CTA(--c-cta-bg 위 흰 글자) 본문 통과', () => {
    // 이전 팔레트에서는 3.29:1이라 '큰 버튼 전용'이었다. L을 낮춰 본문 기준을 넘겼다.
    expect(meetsAA(contrastRatio(light['--pink-600']!, '#ffffff'), { large: false })).toBe(true)
  })

  it('트랙 3색이 같은 대비대에 있다 — 색조만 다르고 읽힘은 같아야 한다(OKLCH를 쓰는 이유)', () => {
    const ratios = [light['--mint-ink']!, light['--pink-600']!, light['--lavender-ink']!].map((c) =>
      contrastRatio(c, light['--surface']!),
    )
    for (const r of ratios) expect(meetsAA(r, { large: false })).toBe(true)
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThan(1.5)
  })
  it('라이트: --pink-ink on --pink-100 본문 통과', () => {
    expect(meetsAA(contrastRatio(light['--pink-ink']!, light['--pink-100']!), { large: false })).toBe(true)
  })
  it('다크: --ink on --surface 본문 통과(평탄화 아님 — 라이트와 다른 값)', () => {
    expect(dark['--surface']).not.toBe(light['--surface']) // 다크=라이트 평탄화 금지
    expect(meetsAA(contrastRatio(dark['--ink']!, dark['--surface']!), { large: false })).toBe(true)
  })
})
