import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Realtime 채널에 묶는 표는 **전부 publication에 있어야** 한다.
//
// 2026-09-26 Flutter 앱에서 잡은 버그: `profiles`가 publication에 없는데 채널에 묶여 있었다.
// Realtime은 그런 채널을 SUBSCRIBED라고 답하면서 **아무 이벤트도 안 보낸다** — 에러도 없다.
// 상대가 추가한 일정·장소가 앱을 껐다 켤 때까지 안 보인 원인이었다. 웹은 우연히 profiles를
// 안 묶고 있었을 뿐이라, 다음에 누가 한 줄 더하는 순간 같은 방식으로 죽는다. 여기서 막는다.

const ROOT = join(__dirname, '..', '..')

function publishedTables(): Set<string> {
  const dir = join(ROOT, 'supabase', 'migrations')
  const out = new Set<string>()
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
    const sql = readFileSync(join(dir, f), 'utf8')
    for (const m of sql.matchAll(/ALTER PUBLICATION supabase_realtime ADD TABLE public\.(\w+)/g)) out.add(m[1]!)
  }
  return out
}

function subscribedTables(): Map<string, string[]> {
  const dir = join(ROOT, 'src', 'hooks')
  const byTable = new Map<string, string[]>()
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') || n.endsWith('.tsx'))) {
    const src = readFileSync(join(dir, f), 'utf8')
    if (!src.includes('postgres_changes')) continue
    for (const m of src.matchAll(/table:\s*'(\w+)'/g)) {
      const t = m[1]!
      byTable.set(t, [...(byTable.get(t) ?? []), f])
    }
  }
  return byTable
}

describe('Realtime publication 계약', () => {
  it('★★★ 훅이 구독하는 모든 표가 publication에 있다', () => {
    const published = publishedTables()
    expect(published.size).toBeGreaterThan(5) // 마이그레이션을 못 읽으면 여기서 걸린다
    const missing = [...subscribedTables()].filter(([t]) => !published.has(t))
    expect(missing, `publication 밖 표가 끼면 채널 전체가 조용히 죽는다: ${JSON.stringify(missing)}`).toEqual([])
  })

  it('★ 무엇을 검사했는지 — 비어 있으면 훅을 못 찾은 것이다', () => {
    expect(subscribedTables().size).toBeGreaterThan(5)
  })

  it('★★ 0027로 profiles도 publication에 들어간다(앱이 이름·색 변경을 실시간으로 받게)', () => {
    expect(publishedTables().has('profiles')).toBe(true)
  })
})
