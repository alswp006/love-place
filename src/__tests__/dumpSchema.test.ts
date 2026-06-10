import { describe, it, expect } from 'vitest'
import { assembleExport, EXPORT_VERSION, EXPORT_TABLES } from '@/lib/export/dumpSchema'

describe('assembleExport (내보내기 v0 봉투)', () => {
  it('version·exportedAt·coupleId·tables 봉투 구조', () => {
    const env = assembleExport('c1', { places: [{ id: 'p1' }], wishes: [] }, '2026-06-10T00:00:00.000Z')
    expect(env.version).toBe(EXPORT_VERSION)
    expect(env.exportedAt).toBe('2026-06-10T00:00:00.000Z')
    expect(env.coupleId).toBe('c1')
    expect(env.tables.places).toEqual([{ id: 'p1' }])
    expect(env.tables.wishes).toEqual([])
  })

  it('내보내기 대상 테이블에 핵심 공유 테이블이 포함된다', () => {
    for (const t of ['places', 'wishes', 'visits', 'trips', 'photos', 'events', 'itineraries', 'reactions']) {
      expect(EXPORT_TABLES).toContain(t)
    }
  })

  it('JSON 직렬화 안정(round-trip)', () => {
    const env = assembleExport('c1', { places: [{ id: 'p1', name: '카페' }] }, '2026-06-10T00:00:00.000Z')
    const round = JSON.parse(JSON.stringify(env))
    expect(round).toEqual(env)
  })
})
