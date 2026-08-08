import { describe, it, expect } from 'vitest'
import { readExif, parseExifDate, dmsToDegrees } from '@/lib/photos/exif'

// EXIF는 리사이즈 전에만 읽을 수 있다(캔버스 재인코딩이 지운다) — 파서를 못박는다.

/** 최소 JPEG + APP1(EXIF) 바이트를 손으로 만든다. 리틀엔디언 TIFF. */
function jpegWithExif(opts: {
  orientation?: number
  dateTimeOriginal?: string
  gps?: { latRef: string; lat: [number, number, number]; lngRef: string; lng: [number, number, number] }
}): ArrayBuffer {
  type Entry = { tag: number; type: number; count: number; data: number[] }
  const heap: number[] = [] // IFD 밖에 놓이는 값들(오프셋 참조)
  const TIFF_HEADER = 8
  const ifd0: Entry[] = []
  const exifIfd: Entry[] = []
  const gpsIfd: Entry[] = []

  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff]
  const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]

  if (opts.orientation) ifd0.push({ tag: 0x0112, type: 3, count: 1, data: [...u16(opts.orientation), 0, 0] })
  if (opts.dateTimeOriginal) exifIfd.push({ tag: 0x9003, type: 2, count: opts.dateTimeOriginal.length + 1, data: [] })
  if (opts.gps) {
    gpsIfd.push({ tag: 0x0001, type: 2, count: 2, data: [] })
    gpsIfd.push({ tag: 0x0002, type: 5, count: 3, data: [] })
    gpsIfd.push({ tag: 0x0003, type: 2, count: 2, data: [] })
    gpsIfd.push({ tag: 0x0004, type: 5, count: 3, data: [] })
  }

  // 레이아웃: IFD0 | EXIF IFD | GPS IFD | heap
  const ifd0Count = ifd0.length + (exifIfd.length ? 1 : 0) + (gpsIfd.length ? 1 : 0)
  const ifd0Size = 2 + ifd0Count * 12 + 4
  const exifOff = TIFF_HEADER + ifd0Size
  const exifSize = exifIfd.length ? 2 + exifIfd.length * 12 + 4 : 0
  const gpsOff = exifOff + exifSize
  const gpsSize = gpsIfd.length ? 2 + gpsIfd.length * 12 + 4 : 0
  let heapOff = gpsOff + gpsSize

  const tiff: number[] = [0x49, 0x49, 0x2a, 0x00, ...u32(TIFF_HEADER)]

  const pushHeap = (bytes: number[]) => {
    const at = heapOff
    heap.push(...bytes)
    heapOff += bytes.length
    return at
  }

  // IFD0
  tiff.push(...u16(ifd0Count))
  for (const e of ifd0) tiff.push(...u16(e.tag), ...u16(e.type), ...u32(e.count), ...e.data)
  if (exifIfd.length) tiff.push(...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifOff))
  if (gpsIfd.length) tiff.push(...u16(0x8825), ...u16(4), ...u32(1), ...u32(gpsOff))
  tiff.push(...u32(0))

  // EXIF IFD
  if (exifIfd.length) {
    tiff.push(...u16(exifIfd.length))
    const s = opts.dateTimeOriginal!
    const at = pushHeap([...Array.from(s, (c) => c.charCodeAt(0)), 0])
    tiff.push(...u16(0x9003), ...u16(2), ...u32(s.length + 1), ...u32(at))
    tiff.push(...u32(0))
  }
  // GPS IFD
  if (gpsIfd.length) {
    const g = opts.gps!
    tiff.push(...u16(4))
    const latRefAt = pushHeap([g.latRef.charCodeAt(0), 0])
    const latAt = pushHeap(g.lat.flatMap((n) => [...u32(Math.round(n * 100)), ...u32(100)]))
    const lngRefAt = pushHeap([g.lngRef.charCodeAt(0), 0])
    const lngAt = pushHeap(g.lng.flatMap((n) => [...u32(Math.round(n * 100)), ...u32(100)]))
    tiff.push(...u16(0x0001), ...u16(2), ...u32(2), ...u32(latRefAt))
    tiff.push(...u16(0x0002), ...u16(5), ...u32(3), ...u32(latAt))
    tiff.push(...u16(0x0003), ...u16(2), ...u32(2), ...u32(lngRefAt))
    tiff.push(...u16(0x0004), ...u16(5), ...u32(3), ...u32(lngAt))
    tiff.push(...u32(0))
  }
  tiff.push(...heap)

  const exifPayload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff] // 'Exif\0\0' + TIFF
  const len = exifPayload.length + 2
  const bytes = [0xff, 0xd8, 0xff, 0xe1, (len >> 8) & 0xff, len & 0xff, ...exifPayload, 0xff, 0xd9]
  return new Uint8Array(bytes).buffer
}

describe('parseExifDate · dmsToDegrees', () => {
  it("'YYYY:MM:DD HH:MM:SS'를 로컬 시각으로 읽는다", () => {
    const iso = parseExifDate('2026:08:05 14:30:00')
    expect(iso).not.toBeNull()
    const d = new Date(iso!)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(5)
    expect(d.getHours()).toBe(14)
  })

  it('형식이 아니면 null — 없는 값을 지어내지 않는다', () => {
    expect(parseExifDate('')).toBeNull()
    expect(parseExifDate('2026-08-05')).toBeNull()
  })

  it('도분초 → 십진도, S/W는 음수', () => {
    expect(dmsToDegrees([38, 12, 0], 'N')).toBeCloseTo(38.2, 5)
    expect(dmsToDegrees([38, 12, 0], 'S')).toBeCloseTo(-38.2, 5)
    expect(dmsToDegrees([200, 0, 0], 'N')).toBeNull() // 범위 밖
  })
})

describe('readExif', () => {
  it('JPEG이 아니면 기본값', () => {
    expect(readExif(new Uint8Array([1, 2, 3, 4]).buffer)).toEqual({
      takenAt: null,
      lat: null,
      lng: null,
      orientation: 1,
    })
  })

  it('회전 태그를 읽는다 — 세로 사진이 눕지 않게 하는 근거', () => {
    expect(readExif(jpegWithExif({ orientation: 6 })).orientation).toBe(6)
  })

  it('촬영 시각을 읽는다', () => {
    const r = readExif(jpegWithExif({ dateTimeOriginal: '2026:08:05 14:30:00' }))
    expect(r.takenAt).not.toBeNull()
    expect(new Date(r.takenAt!).getFullYear()).toBe(2026)
  })

  it('좌표를 읽는다(속초 근처)', () => {
    const r = readExif(
      jpegWithExif({
        gps: { latRef: 'N', lat: [38, 12, 0], lngRef: 'E', lng: [128, 35, 0] },
      }),
    )
    expect(r.lat).toBeCloseTo(38.2, 3)
    expect(r.lng).toBeCloseTo(128.583, 2)
  })

  it('EXIF가 없는 JPEG면 기본값(빈 값을 지어내지 않는다)', () => {
    const bare = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer
    expect(readExif(bare)).toEqual({ takenAt: null, lat: null, lng: null, orientation: 1 })
  })
})
