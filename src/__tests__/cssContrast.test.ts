import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { contrastRatio, parseColor } from '@/lib/a11y/contrast'
import { readTokenThemes, resolveVar, stripComments, type TokenMap } from './helpers/cssTokens'

// 컴포넌트 CSS를 **소스에서 직접** 훑어, 배경과 글자색을 라이트·다크 양쪽에서 실제로 계산한다.
//
// 왜 이 게이트가 생겼나: 토큰 대비 테스트는 tokens.css 안의 짝만 봤다. 그런데 실제 사고는
// 컴포넌트가 토큰을 **안 쓰고** 색을 박을 때 났다 — `.cta { background: var(--pink-600); color: #fff }`.
// --pink-600은 다크에서 밝아지는데 글자는 흰색으로 고정이라 2.12:1(로그인 주 버튼)이었다.
// 토큰만 보는 테스트로는 영원히 못 잡는다. 그래서 "칠한 곳마다" 검사한다.

const ROOT = resolve(process.cwd(), 'src')

function cssFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) cssFiles(p, out)
    else if (name.endsWith('.module.css')) out.push(p)
  }
  return out
}

/** 중괄호 균형을 맞춰 `@<이름> ... { ... }` 블록을 통째로 떼어낸다. */
function splitAtRule(css: string, head: string): { inner: string[]; rest: string } {
  const inner: string[] = []
  let rest = ''
  let i = 0
  while (i < css.length) {
    const at = css.indexOf(head, i)
    if (at < 0) {
      rest += css.slice(i)
      break
    }
    rest += css.slice(i, at)
    const open = css.indexOf('{', at)
    if (open < 0) break
    let depth = 0
    let j = open
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++
      else if (css[j] === '}' && --depth === 0) break
    }
    inner.push(css.slice(open + 1, j))
    i = j + 1
  }
  return { inner, rest }
}

type Rule = { bg: string | null; fg: string | null }

/** 평평한 CSS → 셀렉터별 { background, color }. 나중 선언이 이긴다(캐스케이드 근사). */
function rules(css: string): Map<string, Rule> {
  const out = new Map<string, Rule>()
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1]!.trim().replace(/\s+/g, ' ')
    const body = m[2]!
    const cur: Rule = out.get(sel) ?? { bg: null, fg: null }
    for (const d of body.split(';')) {
      const [rawProp, ...rawVal] = d.split(':')
      if (!rawProp || rawVal.length === 0) continue
      const prop = rawProp.trim()
      const val = rawVal.join(':').trim()
      if (prop === 'background' || prop === 'background-color') cur.bg = val
      else if (prop === 'color') cur.fg = val
    }
    out.set(sel, cur)
  }
  return out
}

/** background 축약형에서 색 부분만. 그라디언트·이미지·투명은 대상 밖(부모가 비쳐 계산 불가). */
function backgroundColor(value: string): string | null {
  const v = value.trim()
  if (!v || /gradient|url\(|none|transparent|currentcolor/i.test(v)) return null
  // `var(--x)` 하나거나 색 리터럴 하나일 때만 본다. `#fff url(...)` 같은 축약은 건너뛴다.
  if (/^var\(/.test(v) || /^#[0-9a-fA-F]{3,8}$/.test(v)) return v
  return null
}

/** 반투명(알파)이면 아래가 비쳐 실제 대비를 정할 수 없다 — 계산 대상에서 뺀다. */
function opaque(color: string): boolean {
  if (/^#[0-9a-fA-F]{8}$/.test(color) || /^#[0-9a-fA-F]{4}$/.test(color)) return false
  if (/rgba?\(|hsla?\(/i.test(color)) return false
  if (/oklch\([^)]*\//i.test(color)) return false // oklch(... / 0.72)
  return true
}

type Checked = { file: string; sel: string; theme: string; ratio: number }

function collect(theme: 'light' | 'dark', tokens: TokenMap): Checked[] {
  const checked: Checked[] = []
  for (const file of cssFiles(ROOT)) {
    const css = stripComments(readFileSync(file, 'utf8'))
    // @keyframes는 셀렉터가 아니라 구간이라 대비 개념이 없다 — 통째로 뺀다.
    const noKeyframes = splitAtRule(css, '@keyframes').rest
    const darkSplit = splitAtRule(noKeyframes, '@media (prefers-color-scheme: dark)')
    // @media/@supports 안의 나머지 규칙도 같은 테마에서 평가한다(래퍼만 벗긴다).
    const flatten = (s: string): string => {
      const r = splitAtRule(s, '@media')
      const sup = splitAtRule(r.rest, '@supports')
      return [sup.rest, ...r.inner, ...sup.inner].join('\n')
    }
    const base = rules(flatten(darkSplit.rest))
    if (theme === 'dark') {
      for (const [sel, r] of rules(flatten(darkSplit.inner.join('\n')))) {
        const prev = base.get(sel) ?? { bg: null, fg: null }
        base.set(sel, { bg: r.bg ?? prev.bg, fg: r.fg ?? prev.fg })
      }
    }
    for (const [sel, r] of base) {
      if (!r.bg || !r.fg) continue
      const bgRaw = backgroundColor(r.bg)
      if (!bgRaw) continue
      const bg = resolveVar(bgRaw, tokens)
      const fg = resolveVar(r.fg, tokens)
      if (!bg || !fg || !opaque(bg) || !opaque(fg)) continue
      try {
        parseColor(bg)
        parseColor(fg)
      } catch {
        continue // 우리가 못 읽는 표기(color-mix 등) — 지어내지 않고 건너뛴다
      }
      checked.push({ file: relative(process.cwd(), file), sel, theme, ratio: contrastRatio(bg, fg) })
    }
  }
  return checked
}

const { light, dark } = readTokenThemes()
const all = [...collect('light', light), ...collect('dark', dark)]

describe('컴포넌트 CSS 대비 게이트(라이트·다크 양쪽)', () => {
  it('실제로 무언가를 검사했다 — 파서가 조용히 0건이 되지 않는다', () => {
    // 이 가드가 없으면 셀렉터 표기가 바뀌는 순간 게이트가 무음으로 비어버린다(전에 겪었다).
    expect(all.filter((c) => c.theme === 'light').length).toBeGreaterThan(25)
    expect(all.filter((c) => c.theme === 'dark').length).toBeGreaterThan(25)
  })

  it('채운 표면 위 글자가 양쪽 테마에서 WCAG AA(4.5:1)', () => {
    const fails = all
      .filter((c) => c.ratio < 4.5)
      .map((c) => `${c.theme} ${c.file} ${c.sel} = ${c.ratio.toFixed(2)}:1`)
    expect(fails).toEqual([])
  })
})
