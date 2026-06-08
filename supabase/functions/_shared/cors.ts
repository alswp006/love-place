// CORS — 우리 앱 도메인만 허용(§10.1 Origin 화이트리스트). 로컬 개발 + 배포 도메인.
// ALLOWED_ORIGINS 환경변수(쉼표구분)로 운영 도메인 추가. 미설정 시 localhost만.
const DEFAULT_ALLOWED = ['http://localhost:5173', 'http://localhost:4173']

function allowedOrigins(): string[] {
  const env = Deno.env.get('ALLOWED_ORIGINS')
  const extra = env ? env.split(',').map((s) => s.trim()).filter(Boolean) : []
  return [...DEFAULT_ALLOWED, ...extra]
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const list = allowedOrigins()
  const allow = origin && list.includes(origin) ? origin : list[0]
  return {
    'Access-Control-Allow-Origin': allow ?? 'http://localhost:5173',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}
