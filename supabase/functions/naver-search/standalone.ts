// ──────────────────────────────────────────────────────────────────────────
// naver-search (대시보드 붙여넣기용 단일 파일 — _shared import 인라인)
// Supabase 대시보드 → Edge Functions → Deploy a new function → Via Editor
//   함수 이름: naver-search  / 아래 전체를 붙여넣고 Deploy.
// 필요한 시크릿(대시보드 Edge Functions → Secrets):
//   NAVER_SEARCH_CLIENT_ID, NAVER_SEARCH_CLIENT_SECRET
//   (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 자동 제공됨)
// 정본은 supabase/functions/naver-search/index.ts — 이 파일은 배포 편의용 사본.
// ──────────────────────────────────────────────────────────────────────────
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const FN = 'naver-search'
const CACHE_TTL = 60
const PER_MIN = 30
const PER_DAY = 600

// ── CORS (배포 도메인 포함) ──
const ALLOWED = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://love-place-production.up.railway.app',
  ...(Deno.env.get('ALLOWED_ORIGINS')?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
]
function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED.includes(origin) ? origin : ALLOWED[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

// ── 에러 응답 ──
type Code =
  | 'UNAUTHENTICATED' | 'NOT_COUPLE_MEMBER' | 'RATE_LIMITED' | 'QUOTA_EXCEEDED'
  | 'BAD_REQUEST' | 'UPSTREAM_ERROR' | 'VALIDATION_FAILED' | 'TIMEOUT'
const HTTP: Record<Code, number> = {
  UNAUTHENTICATED: 401, NOT_COUPLE_MEMBER: 403, RATE_LIMITED: 429, QUOTA_EXCEEDED: 402,
  BAD_REQUEST: 400, UPSTREAM_ERROR: 502, VALIDATION_FAILED: 422, TIMEOUT: 504,
}
function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}
function err(code: Code, message: string, origin: string | null, retryAfterSec?: number): Response {
  return json({ ok: false, code, message, ...(retryAfterSec ? { retryAfterSec } : {}) }, HTTP[code], origin)
}

function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

type NaverItem = {
  title: string; link: string; category: string; telephone: string
  address: string; roadAddress: string; mapx: string; mapy: string
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return err('BAD_REQUEST', 'POST만 허용됩니다.', origin)

  const sb = admin()

  // 인증 + 커플 멤버십
  const authz = req.headers.get('Authorization')
  if (!authz?.startsWith('Bearer ')) return err('UNAUTHENTICATED', '로그인이 필요해요.', origin)
  const { data: u } = await sb.auth.getUser(authz.slice(7))
  if (!u.user) return err('UNAUTHENTICATED', '세션이 만료됐어요. 다시 로그인해 주세요.', origin)
  // PENDING(연결 전)도 허용 — RLS current_couple_id()와 동일(status<>'DISCONNECTED'). 혼자도 검색 가능.
  const { data: couple } = await sb.from('couples').select('id')
    .or(`user_a.eq.${u.user.id},user_b.eq.${u.user.id}`)
    .neq('status', 'DISCONNECTED').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!couple) return err('NOT_COUPLE_MEMBER', '먼저 상대와 연결해 주세요.', origin)
  const coupleId = couple.id as string

  // 입력
  let bodyJson: { query?: string }
  try { bodyJson = await req.json() } catch { return err('BAD_REQUEST', '잘못된 요청이에요.', origin) }
  const query = (bodyJson.query ?? '').trim()
  if (!query || query.length > 50) return err('BAD_REQUEST', '검색어를 1~50자로 입력해 주세요.', origin)

  // 캐시
  const cacheKey = FN + ':' + (await sha256Hex(query))
  const { data: c } = await sb.from('proxy_cache').select('payload, expires_at').eq('cache_key', cacheKey).maybeSingle()
  if (c && new Date(c.expires_at).getTime() > Date.now()) {
    return json({ ...(c.payload as object), cached: true }, 200, origin)
  }

  // 레이트리밋(분/일)
  const now = Date.now()
  const { count: minC } = await sb.from('proxy_call_log').select('id', { count: 'exact', head: true })
    .eq('couple_id', coupleId).eq('fn', FN).gte('called_at', new Date(now - 60_000).toISOString())
  if ((minC ?? 0) >= PER_MIN) return err('RATE_LIMITED', '검색이 너무 빨라요. 잠시 후 다시 시도해 주세요.', origin, 60)
  const { count: dayC } = await sb.from('proxy_call_log').select('id', { count: 'exact', head: true })
    .eq('couple_id', coupleId).eq('fn', FN).gte('called_at', new Date(now - 86_400_000).toISOString())
  if ((dayC ?? 0) >= PER_DAY) return err('RATE_LIMITED', '오늘 검색을 많이 했어요. 잠시 후 다시 시도해 주세요.', origin, 3600)

  // 네이버 호출
  const id = Deno.env.get('NAVER_SEARCH_CLIENT_ID')
  const secret = Deno.env.get('NAVER_SEARCH_CLIENT_SECRET')
  if (!id || !secret) return err('UPSTREAM_ERROR', '검색 설정이 아직 안 됐어요.', origin)

  const url = new URL('https://openapi.naver.com/v1/search/local.json')
  url.searchParams.set('query', query)
  url.searchParams.set('display', '5')
  url.searchParams.set('start', '1')
  url.searchParams.set('sort', 'random')

  let res: Response
  try {
    res = await fetch(url, {
      headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    return err('TIMEOUT', '검색이 지연되고 있어요. 다시 시도해 주세요.', origin)
  }
  if (!res.ok) return err('UPSTREAM_ERROR', '검색 중 문제가 생겼어요.', origin)

  const data = (await res.json()) as { items: NaverItem[] }
  const hits = (data.items ?? []).map((it) => {
    const name = stripTags(it.title)
    const address = it.roadAddress || it.address
    return {
      kakaoPlaceId: `${norm(name)}|${norm(address)}`,
      name, address,
      lat: Number(it.mapy) / 1e7,
      lng: Number(it.mapx) / 1e7,
      category: it.category,
      placeUrl: it.link,
      ...(it.telephone ? { phone: it.telephone } : {}),
    }
  })
  const payload = { ok: true as const, hits, isEnd: true, cached: false }

  await sb.from('proxy_call_log').insert({ couple_id: coupleId, fn: FN })
  await sb.from('proxy_cache').upsert({
    cache_key: cacheKey, fn: FN, payload, expires_at: new Date(Date.now() + CACHE_TTL * 1000).toISOString(),
  })

  return json(payload, 200, origin)
})
