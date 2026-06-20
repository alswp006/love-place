import { describe, it, expect } from 'vitest'
import { unzipSync } from 'fflate'
import { buildExportZip, type ZipPhoto } from '@/lib/export/buildZip'
import { assembleExport, type CoupleExport } from '@/lib/export/dumpSchema'

// 관계종료 회수용 ZIP(§10.4) — JSON 봉투 + 원본 사진 blob. DOM-free·네트워크 없음(blob 주입).
describe('buildExportZip', () => {
  const data: CoupleExport = assembleExport(
    'couple-1',
    { places: [{ id: 'p1', name: '카페' }], wishes: [] },
    '2026-06-16T00:00:00.000Z',
  )

  it('returns a Uint8Array containing data.json that parses back to the same CoupleExport', () => {
    const zip = buildExportZip(data, [])
    expect(zip).toBeInstanceOf(Uint8Array)

    const unzipped = unzipSync(zip)
    expect(Object.keys(unzipped)).toContain('data.json')

    const json = new TextDecoder().decode(unzipped['data.json'])
    expect(JSON.parse(json)).toEqual(data)
  })

  it('includes injected photo blobs at their given names', () => {
    const photos: ZipPhoto[] = [{ name: 'photos/1.jpg', bytes: new Uint8Array([1, 2, 3]) }]
    const zip = buildExportZip(data, photos)

    const unzipped = unzipSync(zip)
    expect(Object.keys(unzipped)).toContain('photos/1.jpg')
    expect(Array.from(unzipped['photos/1.jpg']!)).toEqual([1, 2, 3])
  })

  it('still contains data.json with an empty photo list', () => {
    const zip = buildExportZip(data, [])
    const unzipped = unzipSync(zip)
    expect(Object.keys(unzipped)).toEqual(['data.json'])
  })
})
