import { createClient } from '@supabase/supabase-js'

// Supabase 클라이언트 싱글턴(web-stack.md §4.1). 컴포넌트에서 createClient 재호출 금지.
// 타입: 배포 후 `supabase gen types typescript`로 생성한 Database를 generic으로 주입 예정.
// 그전까지는 untyped 클라이언트를 쓰되, 각 훅 경계에서 명시적 반환 타입(PlaceRow 등)으로 안전 보장.
// 클라이언트엔 anon 키만 — 진짜 방어선은 RLS(§10.2). service_role 키는 절대 여기 오면 안 됨.
// 빈 문자열('')도 미설정으로 취급(.env에 키 칸만 있고 값이 비었을 때 createClient가 throw하는 것 방지).
const url = import.meta.env.VITE_SUPABASE_URL?.trim() || undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || undefined

/** 환경변수가 채워졌는지(=Supabase 연결 가능 상태인지). 미설정 시 로그인 화면이 안내를 띄운다. */
export const isSupabaseConfigured = Boolean(url && anon)

if (!isSupabaseConfigured) {
  // 키가 아직 없을 때(P0b 개발 초기) 앱이 죽지 않고 "설정 필요" 안내를 보여주도록 throw 대신 경고.
  // 키를 넣으면 정상 동작. 빌드/테스트는 가짜 키로도 통과.
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 미설정 — .env에 키를 넣어주세요. (지금은 로그인 비활성)',
  )
}

// 미설정이어도 import 시점에 터지지 않도록 placeholder로 생성(실호출은 isSupabaseConfigured로 가드).
export const supabase = createClient(
  url ?? 'http://localhost:54321',
  anon ?? 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // 매직링크 콜백(URL의 토큰)을 자동 처리(§4.2)
      flowType: 'pkce', // 매직링크/OAuth에 안전한 PKCE 플로우
    },
  },
)
