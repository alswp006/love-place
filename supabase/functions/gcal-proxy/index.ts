// gcal-proxy — 구글 캘린더 연동 프록시 (읽기전용 오버레이 · 둘 다 보기)
// 설계 기본 범위 밖 추가지만 보안 규칙(§10.1) 준수: 구글 client secret · refresh token 은 서버 전용,
// 모든 구글 호출은 이 함수에서. 클라이언트는 action 으로만 접근(JWT + 커플확인 + 레이트리밋 + 캐시).
//
// 필요한 시크릿(Supabase Function Secrets): GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET
//   (Supabase Auth 의 구글 provider 와 동일한 OAuth 클라이언트). 동의화면에 calendar.readonly 스코프 필요.
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

const FN = 'gcal-proxy'
const EVENTS_CACHE_TTL = 120 // 초 — 오버레이는 짧은 TTL(외부 변경 반영 + 과호출 방지)
const PER_MIN = 30
const PER_DAY = 600

// refresh token → 1회용 access token. client secret 은 서버 전용.
async function getAccessToken(refreshToken: string): Promise<string | null> {
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    console.error('[gcal-proxy] missing GOOGLE_OAUTH_CLIENT_ID/SECRET')
    return null
  }
  let res: Response
  try {
    res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  const j = (await res.json()) as { access_token?: string }
  return j.access_token ?? null
}

type GoogleEventItem = {
  id: string
  summary?: string
  status?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  htmlLink?: string
}

type NormalizedEvent = {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  ownerId: string
  color: string
  calendarSummary: string
  source: 'GOOGLE'
  htmlLink?: string
}

function normalizeEvents(
  items: GoogleEventItem[],
  meta: { connectionId: string; ownerId: string; color: string; calendarSummary: string },
): NormalizedEvent[] {
  return items
    .filter((it) => it.status !== 'cancelled' && Boolean(it.start?.dateTime || it.start?.date))
    .map((it) => {
      const allDay = Boolean(it.start?.date && !it.start?.dateTime)
      const start = (it.start?.dateTime ?? it.start?.date) as string
      const end = (it.end?.dateTime ?? it.end?.date ?? start) as string
      return {
        id: `${meta.connectionId}:${it.id}`,
        title: it.summary?.trim() || '(제목 없음)',
        start,
        end,
        allDay,
        ownerId: meta.ownerId,
        color: meta.color,
        calendarSummary: meta.calendarSummary,
        source: 'GOOGLE' as const,
        ...(it.htmlLink ? { htmlLink: it.htmlLink } : {}),
      }
    })
}

type ConnRow = {
  id: string
  owner_id: string
  google_calendar_id: string | null
  calendar_summary: string | null
  color: string
  is_enabled: boolean
  provider_email: string | null
}

// 호출자(owner=userId) 본인의 연결 + refresh token 로드.
async function loadMyConnectionWithToken(
  ctx: ProxyCtx,
): Promise<{ conn: ConnRow; refreshToken: string } | null> {
  const { data: conn } = await ctx.admin
    .from('google_calendar_connections')
    .select('id, owner_id, google_calendar_id, calendar_summary, color, is_enabled, provider_email')
    .eq('owner_id', ctx.userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!conn) return null
  const { data: tok } = await ctx.admin
    .from('google_calendar_tokens')
    .select('refresh_token')
    .eq('connection_id', conn.id)
    .maybeSingle()
  if (!tok?.refresh_token) return null
  return { conn: conn as ConnRow, refreshToken: tok.refresh_token }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return errorResponse('BAD_REQUEST', 'POST만 허용됩니다.', origin)

  const admin = adminClient()
  const auth = await authenticate(req, admin)
  if ('error' in auth) return auth.error
  const ctx = auth.ctx

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse('BAD_REQUEST', '잘못된 요청이에요.', origin)
  }
  const action = String(body.action ?? '')

  const rl = await checkRateLimit(ctx, FN, PER_MIN, PER_DAY)
  if ('error' in rl) {
    return errorResponse('RATE_LIMITED', '요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.', origin, rl.retryAfterSec)
  }

  // ── connect: OAuth 로 막 받은 refresh token 을 서버에 저장(클라이언트는 1회 전달만) ──
  if (action === 'connect') {
    const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken : ''
    const providerEmail = typeof body.providerEmail === 'string' ? body.providerEmail : null
    if (!refreshToken) {
      return errorResponse('BAD_REQUEST', '구글 인증 정보를 받지 못했어요. 다시 연동해 주세요.', origin)
    }
    const at = await getAccessToken(refreshToken)
    if (!at) {
      return errorResponse('UPSTREAM_ERROR', '구글 연결에 실패했어요. 캘린더 권한 동의를 확인해 주세요.', origin)
    }
    const now = new Date().toISOString()
    const { data: conn, error: cErr } = await admin
      .from('google_calendar_connections')
      .upsert(
        {
          couple_id: ctx.coupleId,
          owner_id: ctx.userId,
          provider_email: providerEmail,
          is_enabled: true,
          deleted_at: null,
          updated_at: now,
          updated_by: ctx.userId,
          created_by: ctx.userId,
        },
        { onConflict: 'owner_id' },
      )
      .select('id')
      .single()
    if (cErr || !conn) {
      console.error('[gcal-proxy] connect upsert failed', cErr?.message)
      return errorResponse('UPSTREAM_ERROR', '연결 저장에 실패했어요. 잠시 후 다시 시도해 주세요.', origin)
    }
    await admin
      .from('google_calendar_tokens')
      .upsert({ connection_id: conn.id, refresh_token: refreshToken, updated_at: now })
    await recordCall(ctx, FN)
    return jsonResponse({ ok: true, connectionId: conn.id }, 200, origin)
  }

  // ── status: 커플 양쪽의 연결 메타데이터(둘 다 보기) ──
  if (action === 'status') {
    const { data: rows } = await admin
      .from('google_calendar_connections')
      .select('owner_id, provider_email, google_calendar_id, calendar_summary, color, is_enabled')
      .eq('couple_id', ctx.coupleId)
      .is('deleted_at', null)
    const connections = (rows ?? []).map((r) => ({
      ownerId: r.owner_id,
      providerEmail: r.provider_email,
      googleCalendarId: r.google_calendar_id,
      calendarSummary: r.calendar_summary,
      color: r.color,
      isEnabled: r.is_enabled,
      isMine: r.owner_id === ctx.userId,
    }))
    return jsonResponse({ ok: true, connections }, 200, origin)
  }

  // ── list_calendars: 내 구글 캘린더 목록(선택용) ──
  if (action === 'list_calendars') {
    const mine = await loadMyConnectionWithToken(ctx)
    if (!mine) return jsonResponse({ ok: true, connected: false, calendars: [] }, 200, origin)
    const at = await getAccessToken(mine.refreshToken)
    if (!at) return errorResponse('UPSTREAM_ERROR', '구글 인증이 만료됐어요. 다시 연동해 주세요.', origin)
    let res: Response
    try {
      res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { Authorization: `Bearer ${at}` },
        signal: AbortSignal.timeout(8000),
      })
    } catch {
      return errorResponse('TIMEOUT', '구글 응답이 지연돼요. 다시 시도해 주세요.', origin)
    }
    if (!res.ok) return errorResponse('UPSTREAM_ERROR', '캘린더 목록을 불러오지 못했어요.', origin)
    const data = (await res.json()) as {
      items?: Array<{ id: string; summary?: string; primary?: boolean; backgroundColor?: string; accessRole?: string }>
    }
    const calendars = (data.items ?? []).map((c) => ({
      id: c.id,
      summary: c.summary ?? c.id,
      primary: Boolean(c.primary),
      backgroundColor: c.backgroundColor ?? null,
      accessRole: c.accessRole ?? null,
    }))
    await recordCall(ctx, FN)
    return jsonResponse({ ok: true, connected: true, calendars }, 200, origin)
  }

  // ── set_calendar: 표시할 캘린더 1개 선택 ──
  if (action === 'set_calendar') {
    const googleCalendarId = typeof body.googleCalendarId === 'string' ? body.googleCalendarId : ''
    const summary = typeof body.summary === 'string' ? body.summary : null
    const color = typeof body.color === 'string' && body.color ? body.color : '#4285F4'
    if (!googleCalendarId) return errorResponse('BAD_REQUEST', '캘린더를 선택해 주세요.', origin)
    const { error: uErr } = await admin
      .from('google_calendar_connections')
      .update({
        google_calendar_id: googleCalendarId,
        calendar_summary: summary,
        color,
        updated_at: new Date().toISOString(),
        updated_by: ctx.userId,
      })
      .eq('owner_id', ctx.userId)
      .is('deleted_at', null)
    if (uErr) return errorResponse('UPSTREAM_ERROR', '선택 저장에 실패했어요.', origin)
    return jsonResponse({ ok: true }, 200, origin)
  }

  // ── disconnect: 내 연결 해제(soft-delete + 토큰 폐기) ──
  if (action === 'disconnect') {
    const mine = await loadMyConnectionWithToken(ctx)
    await admin
      .from('google_calendar_connections')
      .update({ deleted_at: new Date().toISOString(), is_enabled: false, updated_by: ctx.userId })
      .eq('owner_id', ctx.userId)
    if (mine) await admin.from('google_calendar_tokens').delete().eq('connection_id', mine.conn.id)
    return jsonResponse({ ok: true }, 200, origin)
  }

  // ── list_events: 커플 양쪽의 선택된 캘린더 일정(읽기전용 오버레이) ──
  if (action === 'list_events') {
    const timeMin = typeof body.timeMin === 'string' ? body.timeMin : ''
    const timeMax = typeof body.timeMax === 'string' ? body.timeMax : ''
    if (!timeMin || !timeMax || Number.isNaN(Date.parse(timeMin)) || Number.isNaN(Date.parse(timeMax))) {
      return errorResponse('BAD_REQUEST', '조회 기간이 올바르지 않아요.', origin)
    }

    const cacheKey = FN + ':events:' + (await sha256Hex(`${ctx.coupleId}|${timeMin}|${timeMax}`))
    const cached = await cacheGet(ctx, cacheKey)
    if (cached) return jsonResponse({ ...(cached as object), cached: true }, 200, origin)

    // 커플 양쪽의 '선택 완료 + 활성' 연결을 모은다(둘 다 보기).
    const { data: conns } = await admin
      .from('google_calendar_connections')
      .select('id, owner_id, google_calendar_id, calendar_summary, color')
      .eq('couple_id', ctx.coupleId)
      .is('deleted_at', null)
      .eq('is_enabled', true)
      .not('google_calendar_id', 'is', null)
    const list = (conns ?? []) as ConnRow[]
    if (list.length === 0) {
      return jsonResponse({ ok: true, events: [], degraded: false, cached: false }, 200, origin)
    }

    const { data: toks } = await admin
      .from('google_calendar_tokens')
      .select('connection_id, refresh_token')
      .in('connection_id', list.map((c) => c.id))
    const tokenByConn = new Map((toks ?? []).map((t) => [t.connection_id, t.refresh_token]))

    let degraded = false
    const all: NormalizedEvent[] = []
    await Promise.all(
      list.map(async (c) => {
        const refresh = tokenByConn.get(c.id)
        if (!refresh || !c.google_calendar_id) {
          degraded = true
          return
        }
        const at = await getAccessToken(refresh)
        if (!at) {
          degraded = true
          return
        }
        const url = new URL(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.google_calendar_id)}/events`,
        )
        url.searchParams.set('timeMin', timeMin)
        url.searchParams.set('timeMax', timeMax)
        url.searchParams.set('singleEvents', 'true')
        url.searchParams.set('orderBy', 'startTime')
        url.searchParams.set('maxResults', '250')
        let res: Response
        try {
          res = await fetch(url, { headers: { Authorization: `Bearer ${at}` }, signal: AbortSignal.timeout(8000) })
        } catch {
          degraded = true
          return
        }
        if (!res.ok) {
          degraded = true
          return
        }
        const data = (await res.json()) as { items?: GoogleEventItem[] }
        all.push(
          ...normalizeEvents(data.items ?? [], {
            connectionId: c.id,
            ownerId: c.owner_id,
            color: c.color,
            calendarSummary: c.calendar_summary ?? '구글 캘린더',
          }),
        )
      }),
    )

    all.sort((a, b) => a.start.localeCompare(b.start))
    const payload = { ok: true as const, events: all, degraded, cached: false }
    await recordCall(ctx, FN)
    // degraded(부분 실패) 응답은 캐시하지 않는다(다음 호출에 회복 기회).
    if (!degraded) await cacheSet(ctx, cacheKey, FN, payload, EVENTS_CACHE_TTL)
    return jsonResponse(payload, 200, origin)
  }

  return errorResponse('BAD_REQUEST', '알 수 없는 요청이에요.', origin)
})
