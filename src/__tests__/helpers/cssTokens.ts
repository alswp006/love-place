// 테스트 전용 헬퍼 — tokens.css를 읽어 라이트/다크 토큰 표를 만들고 var() 체인을 푼다.
// (파일명이 *.test.ts가 아니므로 vitest가 테스트로 수집하지 않는다.)
//
// 왜 소스를 직접 파싱하나: 토큰 값을 테스트에 다시 적으면 그건 게이트가 아니라 사본이다.
// tokens.css를 고치면 게이트가 같이 움직여야 한다.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export type TokenMap = Record<string, string>

const DARK_AT = '@media (prefers-color-scheme: dark)'

/** `--x: value;` 선언을 전부 긁는다(색이 아닌 것도 포함 — var 체인 해석에 필요). */
function declarations(scope: string): TokenMap {
  const m: TokenMap = {}
  for (const hit of scope.matchAll(/(--[\w-]+)\s*:\s*([^;}]+);/g)) m[hit[1]!] = hit[2]!.trim()
  return m
}

/** tokens.css → { light, dark }. 다크는 라이트 위에 override를 얹은 **완성된** 표다. */
export function readTokenThemes(): { light: TokenMap; dark: TokenMap } {
  const css = stripComments(
    readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8'),
  )
  const darkAt = css.indexOf(DARK_AT)
  const light = declarations(css.slice(css.indexOf(':root'), darkAt))
  const dark = { ...light, ...declarations(css.slice(darkAt)) }
  return { light, dark }
}

export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * `var(--a, fallback)` 체인을 토큰 표로 푼다.
 * 못 푸는 값(컴포넌트가 인라인으로 주입하는 --cat 등)은 null — 호출부가 건너뛴다.
 * 순환 참조는 깊이 제한으로 끊는다.
 */
export function resolveVar(value: string, tokens: TokenMap, depth = 0): string | null {
  const v = value.trim()
  if (depth > 12) return null
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(v)
  if (!m) return v || null
  const named = tokens[m[1]!]
  if (named !== undefined) return resolveVar(named, tokens, depth + 1)
  return m[2] ? resolveVar(m[2], tokens, depth + 1) : null
}
