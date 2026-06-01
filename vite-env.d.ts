/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// 클라이언트에 노출 가능한 공개 환경변수만(§10.1). 비공개 키는 Edge Function 시크릿에만 둔다.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_KAKAO_JS_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
