import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// 배포 컨텍스트 정합성 — 소스가 `src/` 밖 파일을 빌드 시점에 import하면, 그 경로가
// `.dockerignore`에 걸려 있으면 안 된다.
//
// 왜 이 파일이 있나: 2026-08-10에 사이트가 이틀 동안 옛 버전에 멈춰 있었다. 원인은
// `.dockerignore`의 `docs` 한 줄이었다 — 공개 방침 페이지가 `docs/legal/*.md?raw`를
// import하는데 Docker 컨텍스트에 그 파일이 없어 빌드가 죽었고, **Railway는 실패한 배포 대신
// 직전 성공본을 계속 서빙**해서 밖에서는 "그냥 안 바뀌네"로만 보였다.
// 로컬 `npm run build`는 docs가 있으니 멀쩡히 통과한다 — 즉 어떤 게이트도 못 잡는 종류였다.

const ROOT = resolve(__dirname, '../..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

/** src/ 안의 파일들이 import하는 것 중 `src/` 밖으로 나가는 상대경로를 모은다. */
function externalImports(): { from: string; spec: string; resolved: string }[] {
  const found: { from: string; spec: string; resolved: string }[] = []
  for (const file of walk(join(ROOT, 'src'))) {
    // 테스트 파일은 배포 번들에 안 들어가므로 제외(빌드 실패와 무관).
    if (file.includes('__tests__')) continue
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/from\s+'([^']+)'|import\s*\(\s*'([^']+)'/g)) {
      const spec = (m[1] ?? m[2])!
      if (!spec.startsWith('.')) continue
      const resolved = resolve(join(file, '..'), spec.split('?')[0]!)
      if (!resolved.startsWith(join(ROOT, 'src'))) {
        found.push({ from: file.slice(ROOT.length + 1), spec, resolved })
      }
    }
  }
  return found
}

/** .dockerignore에서 주석·부정(!)을 뺀 제외 패턴 목록. */
function dockerExclusions(): string[] {
  return readFileSync(join(ROOT, '.dockerignore'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('!'))
}

describe('배포 컨텍스트(.dockerignore) 정합성', () => {
  it('src/ 밖에서 import하는 파일이 실제로 존재한다', () => {
    for (const { from, spec, resolved } of externalImports()) {
      expect(existsSync(resolved), `${from} → ${spec} (${resolved})`).toBe(true)
    }
  })

  it('★ 빌드가 필요로 하는 최상위 디렉터리를 .dockerignore가 제외하지 않는다', () => {
    // 이 단언이 깨지면 로컬 빌드는 통과해도 **Docker 빌드가 죽는다**. 그리고 Railway는
    // 조용히 옛 버전을 계속 서빙하므로 아무도 눈치채지 못한다.
    const excluded = new Set(dockerExclusions())
    const needed = new Set(
      externalImports().map((i) => i.resolved.slice(ROOT.length + 1).split('/')[0]!),
    )
    for (const dir of needed) {
      expect(
        excluded.has(dir),
        `.dockerignore가 '${dir}'를 제외하는데 소스가 거기서 import한다 — Docker 빌드가 죽는다`,
      ).toBe(false)
    }
  })

  it('공개 방침 문서가 빌드 입력으로 실재한다(심사 URL이 여기 달려 있다)', () => {
    // 이 둘이 없으면 /privacy·/location-policy가 통째로 죽고, App Store 심사에서
    // '개인정보처리방침에 접근할 수 없음'으로 반려된다.
    expect(existsSync(join(ROOT, 'docs/legal/privacy-policy.md'))).toBe(true)
    expect(existsSync(join(ROOT, 'docs/legal/location-policy.md'))).toBe(true)
  })
})
