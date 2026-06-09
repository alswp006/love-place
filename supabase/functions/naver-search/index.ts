// naver-search — 네이버 지역검색 프록시 (kakao-search와 동일 미들웨어, 외부호출+정규화만 교체)
// 키(Client ID/Secret)는 Edge Function 시크릿 전용 — 클라이언트 노출 금지.
// 좌표: 네이버 mapx/mapy = WGS84 ×1e7 (mapx=경도, mapy=위도). ÷1e7로 핀에 바로 사용.
import { corsHeaders } from '../_shared/cors.ts'
import {
  adminClient,
  authenticate,
  checkRateLimit,
  recordCall,
  cacheGet,
  cacheSet,
  sha256Hex,
  jsonResponse,
  errorResponse,
} from '../_shared/middleware.ts'

const FN = 'naver-search'
const CACHE_TTL = 60 // 초 — 자동완성 짧은 TTL
const PER_MIN = 30
const PER_DAY = 600

type NaverItem = {
  title: string
  link: string
  category: string
  telephone: string
  address: string
  roadAddress: string
  mapx: string
  mapy: string
}

// 서버용 정규화(src/lib/naver/normalize.ts와 동일 로직 — Edge는 src import 불가라 복제)
function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return errorResponse('BAD_REQUEST', 'POST만 허용됩니다.', origin)

  const admin = adminClient()
  const auth = await authenticate(req, admin)
  if ('error' in auth) return auth.error
  const ctx = auth.ctx

  let body: { query?: string }
  try {
    body = await req.json()
  } catch {
    return errorResponse('BAD_REQUEST', '잘못된 요청이에요.', origin)
  }
  const query = (body.query ?? '').trim()
  if (!query || query.length > 50) {
    return errorResponse('BAD_REQUEST', '검색어를 1~50자로 입력해 주세요.', origin)
  }

  // 캐시 조회
  const cacheKey = FN + ':' + (await sha256Hex(query))
  const cached = await cacheGet(ctx, cacheKey)
  if (cached) return jsonResponse({ ...(cached as object), cached: true }, 200, origin)

  // 레이트리밋
  const rl = await checkRateLimit(ctx, FN, PER_MIN, PER_DAY)
  if ('error' in rl) {
    return errorResponse('RATE_LIMITED', '검색이 너무 빨라요. 잠시 후 다시 시도해 주세요.', origin, rl.retryAfterSec)
  }

  // 네이버 호출(헤더 인증)
  const clientId = Deno.env.get('NAVER_SEARCH_CLIENT_ID')
  const clientSecret = Deno.env.get('NAVER_SEARCH_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return errorResponse('UPSTREAM_ERROR', '검색 설정이 아직 안 됐어요.', origin)
  }

  const url = new URL('https://openapi.naver.com/v1/search/local.json')
  url.searchParams.set('query', query)
  url.searchParams.set('display', '5') // 네이버 local 최대 5
  url.searchParams.set('start', '1')
  url.searchParams.set('sort', 'random')

  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    return errorResponse('TIMEOUT', '검색이 지연되고 있어요. 다시 시도해 주세요.', origin)
  }
  if (!res.ok) return errorResponse('UPSTREAM_ERROR', '검색 중 문제가 생겼어요.', origin)

  const data = (await res.json()) as { items: NaverItem[] }
  const hits = (data.items ?? []).map((it) => {
    const name = stripTags(it.title)
    const address = it.roadAddress || it.address
    return {
      kakaoPlaceId: `${norm(name)}|${norm(address)}`, // 합성키(네이버 고유 ID 없음)
      name,
      address,
      lat: Number(it.mapy) / 1e7, // 위도
      lng: Number(it.mapx) / 1e7, // 경도
      category: it.category,
      placeUrl: it.link,
      ...(it.telephone ? { phone: it.telephone } : {}),
    }
  })
  const payload = { ok: true as const, hits, isEnd: true, cached: false }

  await recordCall(ctx, FN)
  await cacheSet(ctx, cacheKey, FN, payload, CACHE_TTL)

  return jsonResponse(payload, 200, origin)
})
