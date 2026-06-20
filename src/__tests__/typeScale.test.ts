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
