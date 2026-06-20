import { describe, it, expect, vi, beforeEach } from 'vitest'

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

// Supabase storage download()는 브라우저에서 arrayBuffer()를 가진 Blob을 반환한다.
// jsdom 전역 Blob에는 arrayBuffer()가 없으므로(환경 한계) blob-like 스텁으로 그 계약을 재현.
function blobOf(text: string): Blob {
  const bytes = new TextEncoder().encode(text)
  return {
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Blob
}

describe('fetchPhotoBlobs (Storage 원본 사진 blob)', () => {
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
