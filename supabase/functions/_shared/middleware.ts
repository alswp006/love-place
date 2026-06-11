// 프록시 공통 미들웨어 (03-proxy-contract.md §0)
// (1) JWT 인증 → (2) 커플 멤버십 → (3) 레이트리밋 → (4) 월 상한 → (5) 캐시 → (6) 외부호출 → (7) 캐시기록
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from './cors.ts'
import { type ProxyError, type ProxyErrorCode, HTTP_FOR } from './types.ts'

export type ProxyCtx = {
  userId: string
  coupleId: string
  admin: SupabaseClient // service_role 클라이언트(사용량/캐시 테이블 접근)
}

function envOrThrow(k: string): string {
  const v = Deno.env.get(k)
  if (!v) throw new Error(`Missing env: ${k}`)
  return v
}

export function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

export function errorResponse(
  code: ProxyErrorCode,
  message: string,
  origin: string | null,
  retryAfterSec?: number,
): Response {
  const body: ProxyError = { ok: false, code, message, ...(retryAfterSec ? { retryAfterSec } : {}) }
  return jsonResponse(body, HTTP_FOR[code], origin)
}

// service_role 클라이언트(서버 전용 — 사용량/캐시/레이트리밋 테이블 RLS 우회).
export function adminClient(): SupabaseClient {
  return createClient(envOrThrow('SUPABASE_URL'), envOrThrow('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })
}

// 호출자 JWT 검증 + 커플 확정(§0.2). 요청 본문 couple_id를 신뢰하지 않고 JWT에서 도출.
export async function authenticate(
  req: Request,
  admin: SupabaseClient,
): Promise<{ ctx: ProxyCtx } | { error: Response }> {
  const origin = req.headers.get('Origin')
  const authz = req.headers.get('Authorization')
  if (!authz?.startsWith('Bearer ')) {
    return { error: errorResponse('UNAUTHENTICATED', '로그인이 필요해요.', origin) }
  }
  const token = authz.slice(7)
  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData.user) {
    return { error: errorResponse('UNAUTHENTICATED', '세션이 만료됐어요. 다시 로그인해 주세요.', origin) }
  }
  const userId = userData.user.id

  // 커플 확정: service_role로 조회(RLS 우회). RLS current_couple_id()와 동일 기준으로
  // 'DISCONNECTED 아님'(=ACTIVE+PENDING)을 허용 — 연결 전(PENDING) 혼자라도 검색 등 프록시 사용 가능.
  // .maybeSingle()은 행이 2개 이상이면 '에러'를 던져 정상 멤버도 403으로 오판되므로(=병합 전 두 수정의 합),
  // 목록으로 받아 방어적으로 고른다(ACTIVE 우선). 에러/0건은 로그로 원인을 남긴다("연결됐는데 검색 403" 진단).
  const { data: rows, error: coupleErr } = await admin
    .from('couples')
    .select('id, status')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .neq('status', 'DISCONNECTED')
    .order('connected_at', { ascending: false, nullsFirst: false })

  if (coupleErr) {
    console.error('[authenticate] couple lookup failed', userId, coupleErr.message)
    return {
      error: errorResponse(
        'NOT_COUPLE_MEMBER',
        '연결 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
        origin,
      ),
    }
  }

  // ACTIVE 우선, 없으면 PENDING(연결 전 혼자도 허용). DISCONNECTED는 위 쿼리에서 제외됨.
  const couple = (rows ?? []).find((r) => r.status === 'ACTIVE') ?? (rows ?? [])[0]
  if (!couple) {
    // 진단: 0건 = 이 계정은 (DISCONNECTED 외) 어떤 커플에도 없음 = 미연결.
    console.error('[authenticate] no couple', userId, 'rows:', JSON.stringify(rows ?? []))
    return {
      error: errorResponse('NOT_COUPLE_MEMBER', '먼저 상대와 연결해 주세요.', origin),
    }
  }

  return { ctx: { userId, coupleId: couple.id, admin } }
}

// 슬라이딩(분/일) 레이트리밋 — couple 단위(§0.4). proxy_usage_log에 기록 후 카운트.
export async function checkRateLimit(
  ctx: ProxyCtx,
  fn: string,
  perMinute: number,
  perDay: number,
): Promise<{ ok: true } | { error: ProxyErrorCode; retryAfterSec: number }> {
  const now = Date.now()
  const minuteAgo = new Date(now - 60_000).toISOString()
  const dayAgo = new Date(now - 86_400_000).toISOString()

  const { count: minCount } = await ctx.admin
    .from('proxy_call_log')
    .select('id', { count: 'exact', head: true })
    .eq('couple_id', ctx.coupleId)
    .eq('fn', fn)
    .gte('called_at', minuteAgo)

  if ((minCount ?? 0) >= perMinute) return { error: 'RATE_LIMITED', retryAfterSec: 60 }

  const { count: dayCount } = await ctx.admin
    .from('proxy_call_log')
    .select('id', { count: 'exact', head: true })
    .eq('couple_id', ctx.coupleId)
    .eq('fn', fn)
    .gte('called_at', dayAgo)

  if ((dayCount ?? 0) >= perDay) return { error: 'RATE_LIMITED', retryAfterSec: 3600 }

  return { ok: true }
}

// 호출 기록(레이트리밋·월 사용량 집계용).
export async function recordCall(ctx: ProxyCtx, fn: string): Promise<void> {
  await ctx.admin.from('proxy_call_log').insert({ couple_id: ctx.coupleId, fn })
}

// 캐시 조회/기록(§0.6). cache_key = fn + ':' + sha256(정규화 입력).
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function cacheGet(ctx: ProxyCtx, cacheKey: string): Promise<unknown | null> {
  const { data } = await ctx.admin
    .from('proxy_cache')
    .select('payload, expires_at')
    .eq('cache_key', cacheKey)
    .maybeSingle()
  if (!data) return null
  if (new Date(data.expires_at).getTime() <= Date.now()) return null
  return data.payload
}

export async function cacheSet(
  ctx: ProxyCtx,
  cacheKey: string,
  fn: string,
  payload: unknown,
  ttlSec: number,
): Promise<void> {
  const expires = new Date(Date.now() + ttlSec * 1000).toISOString()
  await ctx.admin
    .from('proxy_cache')
    .upsert({ cache_key: cacheKey, fn, payload, expires_at: expires })
}
