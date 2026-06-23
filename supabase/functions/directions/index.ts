// directions — 도로 스냅 길찾기 프록시 (03-proxy-contract.md route-eta / 04-tasks P4c / security-privacy §1)
// [핸드오프] needs-deploy: `supabase functions deploy directions` + 시크릿(KAKAO_REST_KEY 확인 / TMAP_APP_KEY).
// 클라(useSnappedPolyline)가 인접 leg(N-1)만 보내므로 provider 경유지 상한 무관. leg별 24h 캐시 → 사실상 무료 구간.
// 안전장치: JWT 인증 → 레이트리밋(분20/일200) → 월상한 가드 → leg 캐시 → 카카오모빌리티(1차)/TMap(폴백) → degraded는 측지선 폴백(클라).
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
  type ProxyCtx,
} from '../_shared/middleware.ts'

const FN = 'directions'
const PER_MIN = 20
const PER_DAY = 200
const MONTHLY_CAP = Number(Deno.env.get('MONTHLY_CAP_DIRECTIONS') ?? '5000') || 5000
const CACHE_TTL = 60 * 60 * 24 // leg 24h(03-proxy-contract line 128)

type LatLng = { lat: number; lng: number }
type Leg = { from: LatLng; to: LatLng }
type LegResult = { polyline: LatLng[] | null; distanceMeters: number | null; degraded: boolean }

const round5 = (n: number) => Math.round(n * 1e5) / 1e5
const key5 = (p: LatLng) => `${round5(p.lat)},${round5(p.lng)}`

async function monthlyCount(ctx: ProxyCtx): Promise<number> {
  const m = new Date()
  m.setUTCDate(1)
  m.setUTCHours(0, 0, 0, 0)
  const { count } = await ctx.admin
    .from('proxy_call_log')
    .select('id', { count: 'exact', head: true })
    .eq('couple_id', ctx.coupleId)
    .eq('fn', FN)
    .gte('called_at', m.toISOString())
  return count ?? 0
}

// 카카오모빌리티 자동차 길찾기(단일 origin→destination). 좌표는 'lng,lat'. 성공 시 도로 좌표열+거리.
async function fetchKakao(leg: Leg, restKey: string): Promise<LegResult | null> {
  try {
    const url =
      `https://apis-navi.kakaomobility.com/v1/directions?origin=${leg.from.lng},${leg.from.lat}` +
      `&destination=${leg.to.lng},${leg.to.lat}&priority=RECOMMEND`
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${restKey}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      routes?: Array<{
        result_code?: number
        summary?: { distance?: number }
        sections?: Array<{ roads?: Array<{ vertexes?: number[] }> }>
      }>
    }
    const route = data.routes?.[0]
    if (!route || route.result_code !== 0) return null
    const polyline: LatLng[] = []
    for (const section of route.sections ?? []) {
      for (const road of section.roads ?? []) {
        const v = road.vertexes ?? []
        for (let i = 0; i + 1 < v.length; i += 2) polyline.push({ lng: v[i]!, lat: v[i + 1]! })
      }
    }
    if (polyline.length < 2) return null
    return { polyline, distanceMeters: route.summary?.distance ?? null, degraded: false }
  } catch {
    return null
  }
}

// TMap 자동차 경로(폴백). GeoJSON LineString feature들의 coordinates([lng,lat])를 잇는다.
async function fetchTmap(leg: Leg, appKey: string): Promise<LegResult | null> {
  try {
    const res = await fetch('https://apis.openapi.sk.com/tmap/routes?version=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', appKey },
      body: JSON.stringify({
        startX: String(leg.from.lng),
        startY: String(leg.from.lat),
        endX: String(leg.to.lng),
        endY: String(leg.to.lat),
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { type?: string; coordinates?: number[][] }
        properties?: { totalDistance?: number }
      }>
    }
    const polyline: LatLng[] = []
    let distanceMeters: number | null = null
    for (const f of data.features ?? []) {
      if (typeof f.properties?.totalDistance === 'number') distanceMeters = f.properties.totalDistance
      if (f.geometry?.type === 'LineString') {
        for (const c of f.geometry.coordinates ?? []) polyline.push({ lng: c[0]!, lat: c[1]! })
      }
    }
    if (polyline.length < 2) return null
    return { polyline, distanceMeters, degraded: false }
  } catch {
    return null
  }
}

async function resolveLeg(ctx: ProxyCtx, leg: Leg): Promise<LegResult> {
  const cacheKey = FN + ':' + (await sha256Hex(`CAR|${key5(leg.from)}|${key5(leg.to)}`))
  const cached = (await cacheGet(ctx, cacheKey)) as LegResult | null
  if (cached) return cached

  const kakao = Deno.env.get('KAKAO_REST_KEY')
  const tmap = Deno.env.get('TMAP_APP_KEY')
  let result: LegResult | null = null
  if (kakao) result = await fetchKakao(leg, kakao)
  if (!result && tmap) result = await fetchTmap(leg, tmap)

  if (result) {
    await cacheSet(ctx, cacheKey, FN, result, CACHE_TTL) // 성공 leg만 캐시
    return result
  }
  return { polyline: null, distanceMeters: null, degraded: true } // 둘 다 실패 → 클라가 측지선 폴백(캐시 안 함)
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return errorResponse('BAD_REQUEST', 'POST만 허용됩니다.', origin)

  const admin = adminClient()
  const auth = await authenticate(req, admin)
  if ('error' in auth) return auth.error
  const ctx = auth.ctx

  let body: { legs?: Leg[] }
  try {
    body = await req.json()
  } catch {
    return errorResponse('BAD_REQUEST', '잘못된 요청이에요.', origin)
  }
  const legs = (body.legs ?? []).filter(
    (l) =>
      l &&
      typeof l.from?.lat === 'number' &&
      typeof l.from?.lng === 'number' &&
      typeof l.to?.lat === 'number' &&
      typeof l.to?.lng === 'number',
  )
  if (legs.length === 0) return errorResponse('BAD_REQUEST', '경로 구간이 없어요.', origin)
  if (legs.length > 50) return errorResponse('BAD_REQUEST', '구간이 너무 많아요.', origin)

  const rl = await checkRateLimit(ctx, FN, PER_MIN, PER_DAY)
  if ('error' in rl)
    return errorResponse('RATE_LIMITED', '길찾기 요청이 너무 잦아요. 잠시 후 다시.', origin, rl.retryAfterSec)
  if ((await monthlyCount(ctx)) >= MONTHLY_CAP)
    return errorResponse('QUOTA_EXCEEDED', '이번 달 길찾기 한도에 도달했어요.', origin)

  const results = await Promise.all(legs.map((leg) => resolveLeg(ctx, leg)))
  await recordCall(ctx, FN)
  return jsonResponse({ ok: true, legs: results }, 200, origin)
})
