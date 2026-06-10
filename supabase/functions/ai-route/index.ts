// ai-route — AI 코스 생성 프록시 (03-proxy-contract.md / 설계서 §5.6 / security-privacy §1)
// [핸드오프] needs-supabase: ANTHROPIC_API_KEY 시크릿 + 배포 필요. 클라이언트는 호출만(키 서버 보관).
// 안전장치(기능보다 먼저): JWT 인증 → 레이트리밋 → ★월 비용 상한★ → 캐시 → Anthropic(structured) →
//   ★zod류 검증 + 장소 화이트리스트(환각 차단)★ → 실패/타임아웃 시 ★결정론 TSP 폴백★ → 도착시각 앱 재계산.
// (검증/폴백 로직은 src/lib/anthropic/routeSchema.ts·src/lib/route/*.ts와 동일 — Edge는 Deno라 복제.)
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

const FN = 'ai-route'
const PER_MIN = 3
const PER_DAY = 20
const MONTHLY_CAP = 100 // 월 호출 상한(비용 폭탄 차단 — security §1). env로 조정 가능.
const CACHE_TTL = 60 * 60 * 24 * 14 // AI 결과는 장기 캐시(같은 장소·제약이면 재사용)
const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-6'

type InPlace = { id: string; name: string; lat: number; lng: number; category?: string }
type RouteBody = { places?: InPlace[]; days?: number }

// ── 월 비용 상한: 이번 달 호출 수 집계
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

// ── 결정론 폴백(좌표 nearest-neighbor) — src/lib/route/fallbackTsp.ts 복제
function nearestNeighborOrder(places: InPlace[]): string[] {
  if (places.length === 0) return []
  const rest = places.slice()
  const order: string[] = []
  let cur = rest.splice(0, 1)[0]!
  order.push(cur.id)
  const d2 = (a: InPlace, b: InPlace) => (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2
  while (rest.length > 0) {
    let best = 0
    for (let i = 1; i < rest.length; i++) if (d2(cur, rest[i]!) < d2(cur, rest[best]!)) best = i
    cur = rest.splice(best, 1)[0]!
    order.push(cur.id)
  }
  return order
}

function fallbackPlan(places: InPlace[], days: number) {
  const order = nearestNeighborOrder(places)
  const perDay = Math.ceil(order.length / Math.max(1, days))
  const out: Array<{ day: number; stops: Array<Record<string, unknown>> }> = []
  let t = 600 // 10:00 시작(분)
  for (let d = 0; d < days; d++) {
    const slice = order.slice(d * perDay, (d + 1) * perDay)
    let arrive = t
    const stops = slice.map((placeId, i) => {
      if (i > 0) arrive += 90 + 30 // 직전 체류 90 + 이동 30
      const h = Math.floor(arrive / 60) % 24
      const mm = arrive % 60
      return {
        placeId,
        arrive: `${h < 10 ? '0' : ''}${h}:${mm < 10 ? '0' : ''}${mm}`,
        stayMin: 90,
        moveMemo: '',
        reason: '거리순 자동 배치(폴백)',
      }
    })
    if (slice.length > 0) out.push({ day: d + 1, stops })
  }
  return { days: out, fallback: true as const, disclaimer: '영업시간 미반영 — 방문 전 확인하세요.' }
}

// ── 화이트리스트 검증 — src/lib/anthropic/routeSchema.ts 복제
function validateRoute(input: unknown, allowed: Set<string>): { ok: true; plan: unknown } | { ok: false } {
  if (typeof input !== 'object' || input === null) return { ok: false }
  const days = (input as { days?: unknown }).days
  if (!Array.isArray(days)) return { ok: false }
  for (const d of days) {
    const stops = (d as { stops?: unknown })?.stops
    if (!Array.isArray(stops)) return { ok: false }
    for (const s of stops) {
      const pid = (s as { placeId?: unknown })?.placeId
      if (typeof pid !== 'string' || !allowed.has(pid)) return { ok: false } // 환각/형식 오류 → 폴백
    }
  }
  return { ok: true, plan: input }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return errorResponse('BAD_REQUEST', 'POST만 허용됩니다.', origin)

  const admin = adminClient()
  const auth = await authenticate(req, admin)
  if ('error' in auth) return auth.error
  const ctx = auth.ctx

  let body: RouteBody
  try {
    body = await req.json()
  } catch {
    return errorResponse('BAD_REQUEST', '잘못된 요청이에요.', origin)
  }
  const places = (body.places ?? []).filter((p) => p && typeof p.id === 'string')
  const days = Math.min(Math.max(1, body.days ?? 1), 7)
  if (places.length < 2) return errorResponse('BAD_REQUEST', '장소를 2곳 이상 골라 주세요.', origin)

  const allowed = new Set(places.map((p) => p.id))

  // 캐시
  const cacheKey = FN + ':' + (await sha256Hex(JSON.stringify({ days, ids: [...allowed].sort() })))
  const cached = await cacheGet(ctx, cacheKey)
  if (cached) return jsonResponse({ ...(cached as object), cached: true }, 200, origin)

  // 레이트리밋 + 월 상한(비용 가드)
  const rl = await checkRateLimit(ctx, FN, PER_MIN, PER_DAY)
  if ('error' in rl) return errorResponse('RATE_LIMITED', '코스 생성이 너무 잦아요. 잠시 후 다시.', origin, rl.retryAfterSec)
  if ((await monthlyCount(ctx)) >= MONTHLY_CAP) {
    // 월 비용 천장 = QUOTA_EXCEEDED(402). RATE_LIMITED(429, 분/일 일시한도)와 구분(03-proxy-contract §0.3).
    return errorResponse('QUOTA_EXCEEDED', '이번 달 AI 코스 생성 한도에 도달했어요. 다음 달에 다시 시도해 주세요.', origin)
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  let plan: unknown | null = null

  if (apiKey) {
    try {
      const sys =
        '너는 여행 코스 플래너다. 반드시 입력으로 받은 places의 id만 사용하라(없는 장소 생성 금지). ' +
        '영업시간은 추정하지 말 것. JSON만 출력: {"days":[{"day":1,"stops":[{"placeId","arrive","stayMin","moveMemo","reason"}]}]}.'
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2000,
          system: sys,
          messages: [{ role: 'user', content: JSON.stringify({ days, places }) }],
        }),
        signal: AbortSignal.timeout(20_000),
      })
      if (res.ok) {
        const data = (await res.json()) as { stop_reason?: string; content?: Array<{ type: string; text?: string }> }
        // stop_reason 가드 + 텍스트 블록 파싱
        if (data.stop_reason === 'end_turn') {
          const text = (data.content ?? []).find((b) => b.type === 'text')?.text ?? ''
          const match = text.match(/\{[\s\S]*\}/)
          if (match) {
            try {
              const parsed = JSON.parse(match[0])
              const v = validateRoute(parsed, allowed) // 화이트리스트 검증
              if (v.ok) plan = v.plan
            } catch {
              /* 파싱 실패 → 폴백 */
            }
          }
        }
      }
    } catch {
      /* 타임아웃/네트워크 → 폴백 */
    }
  }

  // AI 실패/검증 실패/키 없음 → 결정론 폴백(최소한 순서는 나온다)
  const payload =
    plan != null
      ? { ok: true as const, plan, fallback: false, cached: false }
      : { ok: true as const, plan: fallbackPlan(places, days), fallback: true, cached: false }

  await recordCall(ctx, FN)
  // 폴백(plan==null)은 캐시하지 않는다 — 일시 실패 1회가 같은 장소셋을 14일간 열화 코스로 고정하는 오염 방지.
  if (plan != null) await cacheSet(ctx, cacheKey, FN, payload, CACHE_TTL)
  return jsonResponse(payload, 200, origin)
})
