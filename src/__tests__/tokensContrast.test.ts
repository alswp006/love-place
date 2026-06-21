import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { contrastRatio, meetsAA } from '@/lib/a11y/contrast'

// tokens.css를 파싱해 라이트/다크 토큰 hex를 추출한다(소스 진실을 직접 게이트).
// vitest는 cwd가 repo 루트 — import.meta.url이 file:// 스킴이 아닐 수 있어 cwd 기준 경로로 읽는다.
const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
function extract(scope: string): Record<string, string> {
  const m: Record<string, string> = {}
  for (const line of scope.split('\n')) {
    const hit = line.match(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/)
    if (hit) m[hit[1]!] = hit[2]!
  }
  return m
}
const darkAt = css.indexOf('@media (prefers-color-scheme: dark)')
const light = extract(css.slice(css.indexOf(':root'), darkAt))
const dark = { ...light, ...extract(css.slice(darkAt)) } // 다크는 라이트 위 override

describe('tokens.css 조건부 대비 게이트(WCAG AA)', () => {
  it('라이트: --ink on --surface, --bg 본문 통과', () => {
    expect(meetsAA(contrastRatio(light['--ink']!, light['--surface']!), { large: false })).toBe(true)
    expect(meetsAA(contrastRatio(light['--ink']!, light['--bg']!), { large: false })).toBe(true)
  })
  it('라이트: --ink-muted on --surface 본문 통과(보정값)', () => {
    expect(meetsAA(contrastRatio(light['--ink-muted']!, light['--surface']!), { large: false })).toBe(true)
  })
  it('라이트: 주요버튼 --pink-400 + 자두(#5A2438) 본문 통과', () => {
    expect(meetsAA(contrastRatio(light['--pink-400']!, '#5A2438'), { large: false })).toBe(true)
  })
  it('라이트: --pink-ink on --pink-100 본문 통과', () => {
    expect(meetsAA(contrastRatio(light['--pink-ink']!, light['--pink-100']!), { large: false })).toBe(true)
  })
  it('다크: --ink on --surface 본문 통과(평탄화 아님 — 라이트와 다른 값)', () => {
    expect(dark['--surface']).not.toBe(light['--surface']) // 다크=라이트 평탄화 금지
    expect(meetsAA(contrastRatio(dark['--ink']!, dark['--surface']!), { large: false })).toBe(true)
  })
})
