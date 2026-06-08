// kakao-search — 카카오 로컬 키워드 검색 프록시 (03-proxy-contract.md (a))
// 클라이언트 자동완성 입력을 받아 카카오 REST를 키 숨겨 호출. 좌표(WGS84)·고유ID 반환.
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

const FN = 'kakao-search'
const CACHE_TTL = 60 // 초 — 자동완성은 짧은 TTL(§0.6)
const PER_MIN = 30
const PER_DAY = 600

type KakaoDoc = {
  id: string
  place_name: string
  road_address_name: string
  address_name: string
  x: string // lng
  y: string // lat
  category_group_name: string
  category_name: string
  place_url: string
  phone?: string
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return errorResponse('BAD_REQUEST', 'POST만 허용됩니다.', origin)

  const admin = adminClient()
  const auth = await authenticate(req, admin)
  if ('error' in auth) return auth.error
  const ctx = auth.ctx

  // 입력 파싱·검증
  let body: { query?: string; x?: number; y?: number; page?: number; size?: number }
  try {
    body = await req.json()
  } catch {
    return errorResponse('BAD_REQUEST', '잘못된 요청이에요.', origin)
  }
  const query = (body.query ?? '').trim()
  if (!query || query.length > 50) {
    return errorResponse('BAD_REQUEST', '검색어를 1~50자로 입력해 주세요.', origin)
  }
  const page = Math.min(Math.max(body.page ?? 1, 1), 3)
  const size = Math.min(Math.max(body.size ?? 15, 1), 15)

  // 캐시 조회
  const round3 = (n?: number) => (typeof n === 'number' ? n.toFixed(3) : '')
  const cacheKey =
    FN + ':' + (await sha256Hex(`${query}|${round3(body.x)}|${round3(body.y)}|${page}|${size}`))
  const cached = await cacheGet(ctx, cacheKey)
  if (cached) {
    return jsonResponse({ ...(cached as object), cached: true }, 200, origin)
  }

  // 레이트리밋
  const rl = await checkRateLimit(ctx, FN, PER_MIN, PER_DAY)
  if ('error' in rl) {
    return errorResponse('RATE_LIMITED', '검색이 너무 빨라요. 잠시 후 다시 시도해 주세요.', origin, rl.retryAfterSec)
  }

  // 카카오 호출
  const kakaoKey = Deno.env.get('KAKAO_REST_KEY')
  if (!kakaoKey) return errorResponse('UPSTREAM_ERROR', '검색 설정이 아직 안 됐어요.', origin)

  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json')
  url.searchParams.set('query', query)
  url.searchParams.set('page', String(page))
  url.searchParams.set('size', String(size))
  if (typeof body.x === 'number' && typeof body.y === 'number') {
    url.searchParams.set('x', String(body.x))
    url.searchParams.set('y', String(body.y))
    url.searchParams.set('sort', 'distance')
  }

  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${kakaoKey}` },
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    return errorResponse('TIMEOUT', '검색이 지연되고 있어요. 다시 시도해 주세요.', origin)
  }
  if (!res.ok) return errorResponse('UPSTREAM_ERROR', '검색 중 문제가 생겼어요.', origin)

  const data = (await res.json()) as { documents: KakaoDoc[]; meta: { is_end: boolean } }
  const hits = data.documents.map((d) => ({
    kakaoPlaceId: d.id,
    name: d.place_name,
    address: d.road_address_name || d.address_name,
    lat: Number(d.y),
    lng: Number(d.x),
    category: d.category_group_name || d.category_name,
    placeUrl: d.place_url,
    ...(d.phone ? { phone: d.phone } : {}),
  }))
  const payload = { ok: true as const, hits, isEnd: data.meta.is_end, cached: false }

  await recordCall(ctx, FN)
  await cacheSet(ctx, cacheKey, FN, payload, CACHE_TTL)

  return jsonResponse(payload, 200, origin)
})
