import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

// Task 12: 선택/탭 핀 transform-origin tip(좌표에 팁 고정).
// center 스케일로 팁이 좌표에서 들리지 않도록 scale 기준점을 글리프 하단(tip)으로 고정한다.
function readCss(rel: string): string {
  const url = new URL(rel, import.meta.url)
  return readFileSync(fileURLToPath(url), 'utf8')
}

// 셀렉터의 규칙 본문만 추출해 해당 블록에 origin이 있는지 단언(파일 전역 매치 회피).
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`)
  const m = css.match(re)
  if (!m || m[1] === undefined) throw new Error(`rule not found: ${selector}`)
  return m[1]
}

describe('핀 transform-origin tip(좌표에 팁 고정)', () => {
  const css = readCss('../components/map/NaverMap.module.css')

  it('.pinSelected는 transform-origin: 50% 100%(팁 고정)을 가진다', () => {
    expect(ruleBody(css, '.pinSelected')).toMatch(/transform-origin:\s*50%\s+100%/)
  })

  it('.pinHit:active .pin도 동일 transform-origin: 50% 100%(탭 스케일 일관)', () => {
    expect(ruleBody(css, '.pinHit:active .pin')).toMatch(/transform-origin:\s*50%\s+100%/)
  })
})
