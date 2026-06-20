// Supabase DB 타입 — P0c 마이그레이션 적용 후 `supabase gen types typescript`로 자동 생성해 교체한다.
// 지금은 수기 stub(핵심 테이블 Row 형태). 쿼리 타입 안전을 위한 최소 정의.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Audit = {
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
  deleted_at: string | null
  version: number
}

export type Database = {
  public: {
    Tables: {
      regions: {
        Row: { code: string; label: string; parent_code: string | null }
        Insert: { code: string; label: string; parent_code?: string | null }
        Update: Partial<{ code: string; label: string; parent_code: string | null }>
        Relationships: []
      }
      couples: {
        Row: {
          id: string
          user_a: string
          user_b: string | null
          status: 'PENDING' | 'ACTIVE' | 'DISCONNECTED'
          invite_code: string | null
          invite_expires_at: string | null
          connected_at: string | null
          created_at: string
          updated_at: string
          version: number
        }
        Insert: { user_a: string; status?: 'PENDING' | 'ACTIVE' | 'DISCONNECTED' }
        Update: Partial<{
          user_b: string | null
          status: 'PENDING' | 'ACTIVE' | 'DISCONNECTED'
          invite_code: string | null
          invite_expires_at: string | null
          connected_at: string | null
          version: number
        }>
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          couple_id: string | null
          display_name: string
          avatar_url: string | null
          color: string
          location_consent_at: string | null
          photo_consent_at: string | null
          created_at: string
          updated_at: string
          version: number
        }
        Insert: { id: string; display_name?: string; color?: string }
        Update: Partial<{
          couple_id: string | null
          display_name: string
          avatar_url: string | null
          color: string
          location_consent_at: string | null
          photo_consent_at: string | null
          version: number
        }>
        Relationships: []
      }
      places: {
        Row: {
          id: string
          couple_id: string
          name: string
          address: string | null
          region_code: string | null
          region_label: string | null
          lat: number | null
          lng: number | null
          category: string | null
          kakao_place_id: string | null
          tags: string[]
          memo: string | null
          added_by: string
        } & Audit
        Insert: {
          couple_id: string
          name: string
          address?: string | null
          region_code?: string | null
          region_label?: string | null
          lat?: number | null
          lng?: number | null
          category?: string | null
          kakao_place_id?: string | null
          tags?: string[]
          memo?: string | null
          added_by: string
          created_by: string
          updated_by: string
        }
        Update: Partial<{
          name: string
          address: string | null
          region_code: string | null
          region_label: string | null
          tags: string[]
          memo: string | null
          updated_by: string
          deleted_at: string | null
          version: number
        }>
        Relationships: []
      }
      wishes: {
        Row: {
          id: string
          couple_id: string
          place_id: string
          user_id: string
          priority: number
        } & Audit
        Insert: {
          couple_id: string
          place_id: string
          user_id: string
          priority?: number
          created_by: string
          updated_by: string
        }
        Update: Partial<{ priority: number; updated_by: string; deleted_at: string | null; version: number }>
        Relationships: []
      }
    }
    Views: {
      v_place_status: {
        Row: {
          place_id: string
          couple_id: string
          is_wished: boolean
          is_visited: boolean
          wished_by: string[]
        }
      }
    }
    Functions: {
      current_couple_id: { Args: Record<string, never>; Returns: string }
      create_invite: { Args: Record<string, never>; Returns: Json }
      accept_invite: { Args: { p_code: string }; Returns: Json }
      disconnect_couple: { Args: { p_couple_id: string }; Returns: Json }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
