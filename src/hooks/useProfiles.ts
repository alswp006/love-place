import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'

// 커플 두 멤버의 프로필(출처 아바타·색 표시용). RLS profiles_self_or_partner_select가 양측 읽기 허용(0004).
export type ProfileLite = { id: string; displayName: string; color: string; avatarUrl: string | null }
export type ProfileMap = Record<string, ProfileLite>

export function useProfiles(coupleId: string | null) {
  return useQuery<ProfileMap>({
    queryKey: ['profiles', coupleId],
    enabled: Boolean(coupleId && isSupabaseConfigured),
    // 프로필은 자주 안 바뀜 → 길게 캐시.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!coupleId) return {}
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, color, avatar_url')
        .eq('couple_id', coupleId)
      if (error) throw new Error(error.message)
      const map: ProfileMap = {}
      for (const row of data ?? []) {
        map[row.id] = {
          id: row.id,
          displayName: row.display_name,
          color: row.color,
          avatarUrl: row.avatar_url,
        }
      }
      return map
    },
  })
}
