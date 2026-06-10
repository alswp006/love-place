// blog-publish — 블로그 발행 프록시 (§7 / security-privacy §3.3 / CLAUDE.md §9)
// [핸드오프] needs-supabase: 비공개 'photos' 버킷 + 공개 'blog-public' 버킷 + (운반책) GitHub 토큰 시크릿 + 배포.
// ★절대 안전장치(블로그 켜기 전 EXIF 제거)★: 원본(비공개) → 다운로드 → EXIF/GPS 스트립 → 공개 경로 재업로드 →
//   페이로드엔 가공본 공개 URL만. 공개 동의 게이트 필수. (resize는 TODO — 이미지 라이브러리 필요.)
import { corsHeaders } from '../_shared/cors.ts'
import { adminClient, authenticate, jsonResponse, errorResponse } from '../_shared/middleware.ts'

const PRIVATE_BUCKET = 'photos'
const PUBLIC_BUCKET = 'blog-public'

// EXIF/GPS 스트립 — src/lib/blog/stripExif.ts와 동일 로직(Deno라 복제). APP1(Exif/XMP)+COM 제거.
function stripJpegMetadata(input: Uint8Array): Uint8Array {
  if (input.length < 2 || input[0] !== 0xff || input[1] !== 0xd8) return input
  const out: number[] = [0xff, 0xd8]
  let i = 2
  while (i + 1 < input.length) {
    if (input[i] !== 0xff) {
      for (let j = i; j < input.length; j++) out.push(input[j]!)
      return new Uint8Array(out)
    }
    const marker = input[i + 1]!
    if (marker === 0xda || marker === 0xd9) {
      for (let j = i; j < input.length; j++) out.push(input[j]!)
      return new Uint8Array(out)
    }
    if (i + 3 >= input.length) break
    const len = (input[i + 2]! << 8) | input[i + 3]!
    const drop = marker === 0xe1 || marker === 0xfe // APP1(Exif/XMP) + COM
    if (!drop) for (let j = i; j < i + 2 + len && j < input.length; j++) out.push(input[j]!)
    i += 2 + len
  }
  return new Uint8Array(out)
}

type PublishBody = {
  consent?: boolean
  photoPaths?: string[] // 비공개 버킷 내 원본 경로
  place?: string
  region?: string | null
  memo?: string | null
  mapUrl?: string | null
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return errorResponse('BAD_REQUEST', 'POST만 허용됩니다.', origin)

  const admin = adminClient()
  const auth = await authenticate(req, admin)
  if ('error' in auth) return auth.error
  const ctx = auth.ctx

  let body: PublishBody
  try {
    body = await req.json()
  } catch {
    return errorResponse('BAD_REQUEST', '잘못된 요청이에요.', origin)
  }

  // ★공개 동의 게이트★ — 동의 없이는 절대 공개하지 않음.
  if (body.consent !== true) {
    return errorResponse('BAD_REQUEST', '공개 동의가 필요해요.', origin)
  }
  const paths = (body.photoPaths ?? []).filter((p) => typeof p === 'string')

  const publicPhotos: Array<{ url: string }> = []
  for (const path of paths) {
    // couple 격리: 경로가 이 커플 폴더 안인지 확인(예: `${coupleId}/...`).
    if (!path.startsWith(`${ctx.coupleId}/`)) {
      return errorResponse('NOT_COUPLE_MEMBER', '다른 커플의 사진은 발행할 수 없어요.', origin)
    }
    // 1) 원본(비공개) 다운로드
    const dl = await admin.storage.from(PRIVATE_BUCKET).download(path)
    if (dl.error || !dl.data) return errorResponse('UPSTREAM_ERROR', '사진을 불러오지 못했어요.', origin)
    const original = new Uint8Array(await dl.data.arrayBuffer())

    // 2) ★EXIF/GPS 스트립★ (TODO: 리사이즈 — 이미지 라이브러리 추가 시)
    const cleaned = stripJpegMetadata(original)

    // 3) 공개 경로에 가공본 재업로드(원본 경로와 분리)
    const publicPath = `${ctx.coupleId}/published/${path.split('/').pop()}`
    const up = await admin.storage.from(PUBLIC_BUCKET).upload(publicPath, cleaned, {
      contentType: 'image/jpeg',
      upsert: true,
    })
    if (up.error) return errorResponse('UPSTREAM_ERROR', '발행 업로드에 실패했어요.', origin)

    const { data: pub } = admin.storage.from(PUBLIC_BUCKET).getPublicUrl(publicPath)
    publicPhotos.push({ url: pub.publicUrl }) // 가공본 공개 URL만(원본/서명 URL 절대 금지)
  }

  // 4) 고정 페이로드(가공본 URL만). 실제 블로그 운반(GitHub PR/_drafts 또는 Webhook)은 TODO(운반책 키도 프록시 경유).
  const payload = {
    place: body.place ?? '',
    region: body.region ?? null,
    memo: body.memo ?? null,
    mapUrl: body.mapUrl ?? null,
    photos: publicPhotos,
  }

  return jsonResponse({ ok: true, payload, published: false, note: 'EXIF 제거·공개 업로드 완료. 블로그 운반은 핸드오프(TODO).' }, 200, origin)
})
