import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// PWA manifest 유효성(P0a DoD — 홈 화면 추가 가능 여부의 정적 검증).
const root = process.cwd()

type Manifest = {
  name?: string
  short_name?: string
  start_url?: string
  display?: string
  theme_color?: string
  icons?: Array<{ sizes: string; purpose: string }>
}

describe('PWA manifest', () => {
  let manifest: Manifest

  // 파싱을 beforeAll로 — malformed면 한 테스트 실패로 격리(describe 본문 파싱은 suite 전체를 폭발시킴).
  beforeAll(() => {
    manifest = JSON.parse(
      readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf-8'),
    ) as Manifest
  })

  it('홈 화면 추가에 필요한 핵심 필드를 가진다', () => {
    expect(manifest.name).toBeTruthy()
    expect(manifest.short_name).toBeTruthy()
    expect(manifest.start_url).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(manifest.theme_color).toBeTruthy()
  })

  it('192·512 아이콘과 maskable 아이콘을 포함한다', () => {
    const icons = manifest.icons ?? []
    const sizes = icons.map((i) => i.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
    expect(icons.some((i) => i.purpose === 'maskable')).toBe(true)
  })

  it('theme_color가 디자인 토큰(--c-brand 라이트값)과 일치한다', () => {
    // 브랜드색 단일 출처 표류 방지: tokens.css의 --c-brand와 manifest theme_color를 묶어 검증.
    // --c-brand는 별칭(var(--pink-600))일 수 있으므로 var() 체인을 hex까지 해석한다.
    const tokens = readFileSync(resolve(root, 'src/styles/tokens.css'), 'utf-8')
    const resolveVar = (name: string, depth = 0): string | undefined => {
      if (depth > 5) return undefined
      const raw = tokens.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim()
      if (!raw) return undefined
      const ref = raw.match(/var\((--[\w-]+)\)/)
      if (ref) return resolveVar(ref[1]!, depth + 1)
      return raw.match(/#[0-9a-fA-F]{6}/)?.[0]?.toLowerCase()
    }
    const brand = resolveVar('--c-brand')
    expect(brand).toBeTruthy()
    expect(manifest.theme_color?.toLowerCase()).toBe(brand)
  })
})
