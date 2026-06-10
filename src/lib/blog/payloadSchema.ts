// 블로그 발행 페이로드 — 고정 스키마 + 가드(§7 / security-privacy §3.3 / CLAUDE.md §9).
// 절대 규칙: photos[].url은 가공본(EXIF 제거·공개 경로) URL만. 원본/비공개 서명 URL 금지.

export type BlogPhoto = { url: string; caption?: string }

export type BlogPayload = {
  place: string
  region: string | null
  dates: { start: string; end: string } | null
  coordinates: { lat: number; lng: number } | null
  memo: string | null
  mapUrl: string | null
  photos: BlogPhoto[]
}

// 비공개/서명 URL 패턴 — 페이로드에 섞이면 발행 차단(프라이버시 붕괴 방지).
const PRIVATE_URL_PATTERNS: RegExp[] = [
  /\/object\/sign\//, // Supabase 서명 URL
  /[?&]token=/, // 서명 토큰
  /X-Amz-/i, // S3 presigned
  /\/private\//, // 비공개 버킷 경로
]

/** photos가 전부 공개 가공본 URL인지 검증. 하나라도 비공개/서명이면 거부. */
export function assertPublicPhotos(photos: BlogPhoto[]): { ok: true } | { ok: false; error: string } {
  for (const p of photos) {
    for (const re of PRIVATE_URL_PATTERNS) {
      if (re.test(p.url)) return { ok: false, error: `비공개/서명 URL이 페이로드에 포함됨: ${p.url}` }
    }
  }
  return { ok: true }
}

export type BuildInput = {
  place: string
  region?: string | null
  dates?: { start: string; end: string } | null
  coordinates?: { lat: number; lng: number } | null
  memo?: string | null
  mapUrl?: string | null
  photos: BlogPhoto[] // 가공본 공개 URL만
}

/** 고정 스키마로 페이로드를 만든다(누락 필드는 null). 공개 URL 가드를 통과해야 반환. */
export function buildBlogPayload(input: BuildInput): { ok: true; payload: BlogPayload } | { ok: false; error: string } {
  const guard = assertPublicPhotos(input.photos)
  if (!guard.ok) return guard
  return {
    ok: true,
    payload: {
      place: input.place,
      region: input.region ?? null,
      dates: input.dates ?? null,
      coordinates: input.coordinates ?? null,
      memo: input.memo ?? null,
      mapUrl: input.mapUrl ?? null,
      photos: input.photos,
    },
  }
}
