// Supabase DB 타입 — P0c 마이그레이션 적용 후 `supabase gen types typescript`로 자동 생성해 교체한다.
// P0b 시점엔 스키마가 아직 없으므로 최소 stub. (Auth만 쓰므로 빈 스키마로 충분.)
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: Record<string, never>
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
