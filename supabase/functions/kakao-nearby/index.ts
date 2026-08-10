// kakao-nearby — 좌표 주변 카테고리 검색 프록시
//
// 왜 새로 만드나: 기존 프록시로는 "담은 장소 근처에 갈 만한 곳"을 가져올 수 없다.
//   · naver-search : 입력이 {query} 문자열 하나 — 좌표·반경·카테고리를 넣을 자리가 없고 최대 5건
//   · kakao-search : x/y를 받지만 `sort=distance`(정렬 힌트)일 뿐이고 **키워드가 필수**다
// 카카오가 실제로 제공하는 `search/category.json`(키워드 없이 좌표+반경+카테고리)이 뚫려 있지 않았다.
//
// 이 함수가 있어야 하는 진짜 이유는 **환각 차단**이다(CLAUDE.md §5-8). "근처 추천"을 모델에게
// 물으면 그럴듯한 가짜 가게와 가짜 영업시간을 만들어 낸다. 후보는 반드시 실존 검색 결과에서 오고,
// 모델은 그 목록 **안에서만** 고르게 한다. 즉 이 프록시가 화이트리스트의 원천이다.
//
// 여러 중심점을 한 번에 받는 이유: 코스는 점이 아니라 선이다. 스톱 사이 중간점들을 함께 넘기면
// '경로 주변'을 한 번의 호출(=레이트리밋 1회)로 훑을 수 있다. 클라이언트가 중심점마다 따로
// 부르면 한도를 금방 태운다.
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

const FN = 'kakao-nearby'
// 가게는 이동하지 않는다 — 자동완성(60초)보다 훨씬 길게 잡아도 안전하고, 비용을 크게 줄인다.
const CACHE_TTL = 6 * 60 * 60
// 한 요청이 upstream을 여러 번 부르므로 키워드 검색(30/600)보다 빡빡하게 잡는다.
const PER_MIN = 10
const PER_DAY = 200
// upstream 호출 총량 상한. centers × categories가 이 값을 넘으면 **centers를 줄인다**(조용히 자르지 않고
// 응답의 sampledCenters로 알린다 — 잘라낸 걸 안 알리면 '다 훑었다'로 읽힌다).
const MAX_UPSTREAM = 12

/** 여행에 의미 있는 카테고리만 허용한다(주차장·약국 같은 건 코스 추천에 소음이다). */
const ALLOWED_CATEGORIES: Record<string, string> = {
  FD6: '음식점',
  CE7: '카페',
  AT4: '관광명소',
  CT1: '문화시설',
  AD5: '숙박',
}
const DEFAULT_CATEGORIES = ['FD6', 'CE7', 'AT4']

type KakaoDoc = {
  id: string
  place_name: string
  road_address_name: string
  address_name: string
  x: string // lng
  y: string // lat
  category_group_code: string
  category_group_name: string
  category_name: string
  place_url: string
  phone?: string
  distance?: string // m — x/y를 준 경우에만 옴
}

type Center = { lat: number; lng: number }

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return errorResponse('BAD_REQUEST', 'POST만 허용됩니다.', origin)

  const admin = adminClient()
  const auth = await authenticate(req, admin)
  if ('error' in auth) return auth.error
  const ctx = auth.ctx

  let body: { centers?: Center[]; radius?: number; categories?: string[]; limit?: number }
  try {
    body = await req.json()
  } catch {
    return errorResponse('BAD_REQUEST', '잘못된 요청이에요.', origin)
  }

  // ── 검증 ──────────────────────────────────────────────────────────
  const centersIn = (Array.isArray(body.centers) ? body.centers : []).filter(
    (c): c is Center => !!c && isFiniteNum(c.lat) && isFiniteNum(c.lng),
  )
  if (centersIn.length === 0) {
    return errorResponse('BAD_REQUEST', '기준 위치가 필요해요.', origin)
  }
  // 반경: 카카오 상한은 20km지만 '코스에 끼워 넣을 만한 거리'를 넘으면 추천이 아니라 소음이다.
  const radius = Math.min(Math.max(Math.round(body.radius ?? 1200), 200), 5000)
  const categories = (
    Array.isArray(body.categories) && body.categories.length > 0
      ? body.categories
      : DEFAULT_CATEGORIES
  )
    .filter((c) => typeof c === 'string' && c in ALLOWED_CATEGORIES)
    .slice(0, 3)
  if (categories.length === 0) {
    return errorResponse('BAD_REQUEST', '지원하지 않는 카테고리예요.', origin)
  }
  const limit = Math.min(Math.max(Math.round(body.limit ?? 12), 1), 20)
  // upstream 총량을 지키려고 centers를 줄인다. 앞쪽 중심점부터 남긴다(경로 순서 = 사용자 의도 순서).
  const maxCenters = Math.max(1, Math.floor(MAX_UPSTREAM / categories.length))
  const centers = centersIn.slice(0, Math.min(centersIn.length, maxCenters, 6))

  // ── 캐시 ──────────────────────────────────────────────────────────
  // 3자리 반올림 ≈ 110m. 손가락 떨림 수준의 좌표 차이로 캐시를 흘리지 않는다.
  const keySrc = JSON.stringify({
    c: centers.map((c) => `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`),
    radius,
    cat: [...categories].sort(),
    limit,
  })
  const cacheKey = FN + ':' + (await sha256Hex(keySrc))
  const cached = await cacheGet(ctx, cacheKey)
  if (cached) return jsonResponse({ ...(cached as object), cached: true }, 200, origin)

  const rl = await checkRateLimit(ctx, FN, PER_MIN, PER_DAY)
  if ('error' in rl) {
    return errorResponse('RATE_LIMITED', '추천을 너무 자주 부르고 있어요. 잠시 후 다시 시도해 주세요.', origin, rl.retryAfterSec)
  }

  const kakaoKey = Deno.env.get('KAKAO_REST_KEY')
  if (!kakaoKey) return errorResponse('UPSTREAM_ERROR', '주변 검색 설정이 아직 안 됐어요.', origin)

  // ── upstream 팬아웃 ────────────────────────────────────────────────
  const upstreamErrors: string[] = []
  const jobs: Promise<KakaoDoc[]>[] = []
  for (const c of centers) {
    for (const code of categories) {
      const url = new URL('https://dapi.kakao.com/v2/local/search/category.json')
      url.searchParams.set('category_group_code', code)
      url.searchParams.set('x', String(c.lng))
      url.searchParams.set('y', String(c.lat))
      url.searchParams.set('radius', String(radius))
      url.searchParams.set('sort', 'distance')
      url.searchParams.set('size', '15')
      jobs.push(
        fetch(url, {
          headers: { Authorization: `KakaoAK ${kakaoKey}` },
          signal: AbortSignal.timeout(8000),
        })
          .then(async (r) => {
            if (!r.ok) {
              // upstream 실패 사유를 삼키지 않는다 — '주변에 없음'과 '키/권한/쿼터 문제'는
              // 사용자에게도 개발자에게도 전혀 다른 사건인데 둘 다 빈 목록으로 보였다.
              upstreamErrors.push(`${r.status}:${(await r.text()).slice(0, 120)}`)
              return [] as KakaoDoc[]
            }
            const d = (await r.json()) as { documents?: KakaoDoc[] }
            return d.documents ?? []
          })
          // 한 조합이 실패해도 전체를 버리지 않는다 — 부분 결과가 빈 결과보다 낫다.
          .catch((e) => {
            upstreamErrors.push(`throw:${String(e).slice(0, 80)}`)
            return [] as KakaoDoc[]
          }),
      )
    }
  }
  const batches = await Promise.all(jobs)
  // upstream이 **전부** 실패했으면 그건 '주변에 없음'이 아니라 장애다. 200+빈목록으로 위장하면
  // 사용자는 반경만 넓히며 헛수고하고, 우리는 키 만료·쿼터 소진을 영영 모른다.
  if (upstreamErrors.length === jobs.length) {
    return errorResponse('UPSTREAM_ERROR', `주변 검색이 응답하지 않아요. (${upstreamErrors[0] ?? ''})`, origin)
  }

  // ── 병합 ──────────────────────────────────────────────────────────
  // 같은 가게가 여러 중심점에서 잡힌다 → id로 접고 **가장 가까운 거리**를 남긴다
  // (경로에서 가장 가까이 스치는 지점이 사용자에게 의미 있는 거리다).
  const byId = new Map<string, { doc: KakaoDoc; distanceM: number }>()
  for (const docs of batches) {
    for (const d of docs) {
      if (!d?.id) continue
      const dist = Number(d.distance)
      const distanceM = Number.isFinite(dist) ? dist : Number.MAX_SAFE_INTEGER
      const prev = byId.get(d.id)
      if (!prev || distanceM < prev.distanceM) byId.set(d.id, { doc: d, distanceM })
    }
  }

  const candidates = [...byId.values()]
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit)
    .map(({ doc: d, distanceM }) => ({
      // kakao-search의 hit와 같은 형태 — 저장 경로(savePlace)를 그대로 재사용할 수 있게.
      kakaoPlaceId: d.id,
      name: d.place_name,
      address: d.road_address_name || d.address_name,
      lat: Number(d.y),
      lng: Number(d.x),
      category: d.category_group_name || d.category_name,
      placeUrl: d.place_url,
      ...(d.phone ? { phone: d.phone } : {}),
      // 여기부터는 추천 전용 부가정보.
      categoryCode: d.category_group_code,
      distanceM: distanceM === Number.MAX_SAFE_INTEGER ? null : distanceM,
    }))

  const payload = {
    ok: true as const,
    candidates,
    /** 실제로 훑은 중심점 수 — 요청보다 적으면 upstream 상한 때문에 줄인 것이다(조용한 절단 금지). */
    sampledCenters: centers.length,
    radius,
    cached: false,
  }

  await recordCall(ctx, FN)
  await cacheSet(ctx, cacheKey, FN, payload, CACHE_TTL)

  return jsonResponse(payload, 200, origin)
})
