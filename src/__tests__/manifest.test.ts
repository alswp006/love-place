import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// PWA manifest 유효성(P0a DoD — 홈 화면 추가 가능 여부의 정적 검증).
// vitest는 프로젝트 루트에서 실행되므로 cwd 기준 경로가 안정적.
const manifestPath = resolve(process.cwd(), 'public/manifest.webmanifest')

describe('PWA manifest', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>

  it('홈 화면 추가에 필요한 핵심 필드를 가진다', () => {
    expect(manifest.name).toBeTruthy()
    expect(manifest.short_name).toBeTruthy()
    expect(manifest.start_url).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(manifest.theme_color).toBe('#b5654a')
  })

  it('192·512 아이콘과 maskable 아이콘을 포함한다', () => {
    const icons = manifest.icons as Array<{ sizes: string; purpose: string }>
    const sizes = icons.map((i) => i.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
    expect(icons.some((i) => i.purpose === 'maskable')).toBe(true)
  })
})
