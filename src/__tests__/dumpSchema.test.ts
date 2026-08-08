import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// fetchPhotoBlobs는 `import { supabase } from '@/lib/supabase/client'`를 쓴다 — 그 경로를 mock.
const download = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    storage: {
      from: (_bucket: string) => ({
        download: (path: string) => download(path),
      }),
    },
  },
}))

import {
  assembleExport,
  EXPORT_VERSION,
  EXPORT_TABLES,
  EXPORT_SKIPPED,
  fetchPhotoBlobs,
} from '@/lib/export/dumpSchema'

describe('assembleExport (내보내기 v0 봉투)', () => {
  it('version·exportedAt·coupleId·tables 봉투 구조', () => {
    const env = assembleExport('c1', { places: [{ id: 'p1' }], wishes: [] }, '2026-06-10T00:00:00.000Z')
    expect(env.version).toBe(EXPORT_VERSION)
    expect(env.exportedAt).toBe('2026-06-10T00:00:00.000Z')
    expect(env.coupleId).toBe('c1')
    expect(env.tables.places).toEqual([{ id: 'p1' }])
    expect(env.tables.wishes).toEqual([])
  })

  it('JSON 직렬화 안정(round-trip)', () => {
    const env = assembleExport('c1', { places: [{ id: 'p1', name: '카페' }] }, '2026-06-10T00:00:00.000Z')
    const round = JSON.parse(JSON.stringify(env))
    expect(round).toEqual(env)
  })
})

// ── 내보내기 대상 목록은 마이그레이션에서 **도출**한다 ─────────────────────────────
//
// 예전 이 자리엔 핵심 8개를 toContain으로 확인하는 검사가 있었다. 그건 부분집합 검사라
// 무엇이 빠져도 통과한다 — 실제로 0016~0023의 새 표 일곱 개(event_completions,
// event_categories, comments, trip_sessions, route_points, location_access_log,
// consent_log)가 전부 빠진 채로 초록불이었다. 회수권(§10.4)이 조용히 반쪽이 된 것이다.
//
// 그래서 SQL을 직접 읽어 `couple_id`를 가진 테이블 집합을 만들고 **등호로** 비교한다.
// 새 테이블을 만들면 이 테스트가 먼저 깨진다. 넣거나, EXPORT_SKIPPED에 이유를 적어야 한다.
function coupleScopedTablesFromMigrations(): string[] {
  const dir = resolve(process.cwd(), 'supabase/migrations')
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n')
    .replace(/--[^\n]*/g, '') // 줄 주석 제거 — 주석 속 예시가 표로 잡히지 않게

  const found: string[] = []
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(/gi
  for (let m = re.exec(sql); m; m = re.exec(sql)) {
    // 괄호 균형으로 컬럼 정의 블록만 잘라낸다(중첩 괄호: numeric(9,6), check(...) 등).
    let depth = 1
    let i = m.index + m[0].length
    for (; i < sql.length && depth > 0; i++) {
      if (sql[i] === '(') depth++
      else if (sql[i] === ')') depth--
    }
    const body = sql.slice(m.index + m[0].length, i - 1)
    if (/\bcouple_id\b/.test(body)) found.push(m[1]!)
  }
  return [...new Set(found)].sort()
}

describe('내보내기 대상 = couple_id를 가진 테이블 전부(§10.4 회수권)', () => {
  const scoped = coupleScopedTablesFromMigrations()

  it('마이그레이션을 실제로 파싱했다 — 0건으로 조용히 통과하지 않는다', () => {
    expect(scoped.length).toBeGreaterThan(10)
    expect(scoped).toContain('places')
  })

  it('빠진 테이블이 없다 — 있으면 사용자가 그 데이터를 영영 못 가져간다', () => {
    const covered = new Set<string>([...EXPORT_TABLES, ...Object.keys(EXPORT_SKIPPED)])
    expect(scoped.filter((t) => !covered.has(t))).toEqual([])
  })

  it('없는 테이블을 내보내려 하지 않는다(오타·삭제된 표)', () => {
    const known = new Set(scoped)
    expect(EXPORT_TABLES.filter((t) => !known.has(t))).toEqual([])
  })

  it('제외는 전부 이유가 적혀 있다 — 이유 없이 뺄 수 없게', () => {
    for (const [t, why] of Object.entries(EXPORT_SKIPPED)) {
      expect(why.length, `${t} 제외 이유 없음`).toBeGreaterThan(10)
    }
    // 제외와 포함이 겹치면 둘 중 하나가 거짓말이다.
    expect(EXPORT_TABLES.filter((t) => t in EXPORT_SKIPPED)).toEqual([])
  })
})

// Supabase storage download()는 브라우저에서 arrayBuffer()를 가진 Blob을 반환한다.
// jsdom 전역 Blob에는 arrayBuffer()가 없으므로(환경 한계) blob-like 스텁으로 그 계약을 재현.
function blobOf(text: string): Blob {
  const bytes = new TextEncoder().encode(text)
  return {
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Blob
}

describe('fetchPhotoBlobs (Storage 사진 표시본 blob)', () => {
  beforeEach(() => download.mockReset())

  it('각 photos 행 storage_url → download, name = photos/<id>.<ext>', async () => {
    download
      .mockResolvedValueOnce({ data: blobOf('AAA'), error: null })
      .mockResolvedValueOnce({ data: blobOf('BBBB'), error: null })
    const out = await fetchPhotoBlobs('c1', [
      { id: 'ph1', storage_url: 'c1/a.jpg' },
      { id: 'ph2', storage_url: 'c1/b.png' },
    ])
    expect(download).toHaveBeenCalledWith('c1/a.jpg')
    expect(download).toHaveBeenCalledWith('c1/b.png')
    expect(out).toHaveLength(2)
    expect(out[0]?.name).toBe('photos/ph1.jpg')
    expect(out[1]?.name).toBe('photos/ph2.png')
    expect(out[0]?.bytes).toBeInstanceOf(Uint8Array)
    expect(out[0]?.bytes.length).toBe(3)
    expect(out[1]?.bytes.length).toBe(4)
  })

  it('한 사진 다운로드 실패는 건너뛴다(번들 중단 안 함)', async () => {
    download
      .mockResolvedValueOnce({ data: null, error: { message: '없음' } })
      .mockResolvedValueOnce({ data: blobOf('OK'), error: null })
    const out = await fetchPhotoBlobs('c1', [
      { id: 'bad', storage_url: 'c1/x.jpg' },
      { id: 'good', storage_url: 'c1/y.jpg' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.name).toBe('photos/good.jpg')
  })

  it('빈 rows → []', async () => {
    const out = await fetchPhotoBlobs('c1', [])
    expect(out).toEqual([])
    expect(download).not.toHaveBeenCalled()
  })

  it('점이 전혀 없는 빈 storage_url → .bin 폴백', async () => {
    download.mockResolvedValueOnce({ data: blobOf('Z'), error: null })
    const out = await fetchPhotoBlobs('c1', [{ id: 'noext', storage_url: '' }])
    expect(out[0]?.name).toBe('photos/noext.bin')
  })
})
