import { describe, it, expect } from 'vitest'
import { stripJpegMetadata, hasExif } from '@/lib/blog/stripExif'
import { assertPublicPhotos, buildBlogPayload } from '@/lib/blog/payloadSchema'

// 합성 JPEG: SOI + APP1(Exif) + APP0(JFIF) + SOS + 엔트로피 + EOI
const jpegWithExif = Uint8Array.from([
  0xff, 0xd8, // SOI
  0xff, 0xe1, 0x00, 0x0a, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x01, 0x02, // APP1 "Exif\0\0.."
  0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, // APP0 "JF"
  0xff, 0xda, 0x00, 0x04, 0x00, 0x01, 0x33, 0x44, // SOS + 엔트로피
  0xff, 0xd9, // EOI
])

describe('stripJpegMetadata / hasExif (EXIF/GPS 제거)', () => {
  it('원본엔 EXIF가 있고 가공본엔 없다 (핵심 안전 검증)', () => {
    expect(hasExif(jpegWithExif)).toBe(true)
    const stripped = stripJpegMetadata(jpegWithExif)
    expect(hasExif(stripped)).toBe(false)
  })

  it('APP1(Exif)는 제거하되 APP0(JFIF)·SOS·EOI는 보존', () => {
    const out = stripJpegMetadata(jpegWithExif)
    expect(out[0]).toBe(0xff)
    expect(out[1]).toBe(0xd8) // SOI 유지
    // APP1(0xFFE1)이 사라졌는지: 바이트열에 FF E1 시퀀스 없음
    let hasApp1 = false
    for (let i = 0; i + 1 < out.length; i++) if (out[i] === 0xff && out[i + 1] === 0xe1) hasApp1 = true
    expect(hasApp1).toBe(false)
    // APP0·SOS·EOI 유지
    expect(Array.from(out).join(',')).toContain('255,224') // FF E0 (APP0)
    expect(Array.from(out).join(',')).toContain('255,218') // FF DA (SOS)
    expect(out[out.length - 2]).toBe(0xff)
    expect(out[out.length - 1]).toBe(0xd9) // EOI
  })

  it('JPEG가 아니면 원본 그대로', () => {
    const notJpeg = Uint8Array.from([0x00, 0x01, 0x02])
    expect(stripJpegMetadata(notJpeg)).toEqual(notJpeg)
    expect(hasExif(notJpeg)).toBe(false)
  })
})

describe('assertPublicPhotos / buildBlogPayload (가공본 URL만)', () => {
  it('서명/비공개 URL은 거부', () => {
    expect(assertPublicPhotos([{ url: 'https://x.supabase.co/storage/v1/object/sign/photos/a.jpg?token=abc' }]).ok).toBe(false)
    expect(assertPublicPhotos([{ url: 'https://s3.aws.com/a.jpg?X-Amz-Signature=zzz' }]).ok).toBe(false)
    expect(assertPublicPhotos([{ url: 'https://x.com/private/a.jpg' }]).ok).toBe(false)
  })

  it('공개 가공본 URL은 통과', () => {
    expect(assertPublicPhotos([{ url: 'https://x.supabase.co/storage/v1/object/public/blog/a.jpg' }]).ok).toBe(true)
  })

  it('buildBlogPayload: 누락 필드 null + 비공개 사진이면 거부', () => {
    const ok = buildBlogPayload({ place: '속초', photos: [{ url: 'https://x.com/public/a.jpg' }] })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.payload.region).toBeNull()
      expect(ok.payload.dates).toBeNull()
    }
    const bad = buildBlogPayload({ place: '속초', photos: [{ url: 'https://x.com/object/sign/a.jpg' }] })
    expect(bad.ok).toBe(false)
  })
})
