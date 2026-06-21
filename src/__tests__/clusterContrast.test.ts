import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

// Task 10: 다크 클러스터 대비(AA) — .cluster 배지가 색만이 아닌 outline+텍스트로
// 이중화되고, prefers-color-scheme:dark에서 대비 override를 갖는지 회귀 단언(§8, R4.2).
function readCss(rel: string): string {
  const url = new URL(rel, import.meta.url)
  return readFileSync(fileURLToPath(url), 'utf8')
}

describe('다크 클러스터 배지 대비', () => {
  const css = readCss('../components/map/NaverMap.module.css')

  it('.cluster가 outline/border로 분리(색만 의존 금지)', () => {
    // .cluster 블록 본문 추출
    const block = css.match(/\.cluster\s*\{[^}]*\}/)?.[0] ?? ''
    expect(block).toMatch(/outline\s*:|border\s*:/)
  })

  it('prefers-color-scheme: dark 미디어쿼리 안에 .cluster override 존재', () => {
    const darkBlock = css.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[\s\S]*\}/)?.[0] ?? ''
    expect(darkBlock).toMatch(/\.cluster\s*\{/)
  })

  it('다크 .cluster override가 대비 bg/텍스트 + outline 이중화', () => {
    // 다크 미디어쿼리 내 .cluster 블록
    const darkCluster = css.match(
      /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[\s\S]*?\.cluster\s*\{([^}]*)\}/,
    )?.[1] ?? ''
    expect(darkCluster).toMatch(/background\s*:/)
    expect(darkCluster).toMatch(/outline\s*:/)
  })
})
