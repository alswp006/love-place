// location-purge — 동의 철회/목적달성 시 개인위치정보 하드 파기 프록시 (위치정보법 제24조4 / 설계 §5[3][4])
// [핸드오프] needs-deploy: `supabase functions deploy location-purge` (SUPABASE_SERVICE_ROLE_KEY 필요).
// 클라(useLocationWithdraw)는 service_role을 못 쓰므로 이 함수가 JWT 검증 → 본인 세션 확인 → purge_location_data(service_role) 호출.
// 본인(owner)만 자기 동선을 파기할 수 있다(제3자 임의 삭제 차단). 동선 + 동반 확인자료(만료분)를 복구불가 DELETE.
import { corsHeaders } from '../_shared/cors.ts'
import { adminClient, authenticate, jsonResponse, errorResponse } from '../_shared/middleware.ts'

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return errorResponse('BAD_REQUEST', 'POST만 허용됩니다.', origin)

  const admin = adminClient()
  const auth = await authenticate(req, admin)
  if ('error' in auth) return auth.error
  const { ctx } = auth

  let body: { sessionId?: string }
  try {
    body = await req.json()
  } catch {
    return errorResponse('BAD_REQUEST', '잘못된 요청이에요.', origin)
  }
  const sessionId = body.sessionId
  if (!sessionId) return errorResponse('BAD_REQUEST', '세션이 없어요.', origin)

  // 세션이 호출자 커플 소속 + owner가 호출자 본인인지 확인(service_role 조회).
  const { data: rows, error: selErr } = await ctx.admin
    .from('trip_sessions')
    .select('id, couple_id, owner_id')
    .eq('id', sessionId)
    .limit(1)
  if (selErr) return errorResponse('UPSTREAM_ERROR', '세션 조회에 실패했어요.', origin)
  const sess = (rows ?? [])[0]
  if (!sess || sess.couple_id !== ctx.coupleId) {
    return errorResponse('NOT_COUPLE_MEMBER', '세션을 찾을 수 없어요.', origin)
  }
  if (sess.owner_id !== ctx.userId) {
    return errorResponse('VALIDATION_FAILED', '본인 동선만 파기할 수 있어요.', origin)
  }

  const { error: rpcErr } = await ctx.admin.rpc('purge_location_data', { p_session: sessionId })
  if (rpcErr) return errorResponse('UPSTREAM_ERROR', '파기 처리에 실패했어요.', origin)

  return jsonResponse({ ok: true }, 200, origin)
})
