import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { useAuth } from '@/state/auth'

export type MyProfile = {
  id: string
  display_name: string
  color: string
  version: number
  location_consent_at: string | null
  photo_consent_at: string | null
}

// 내 프로필 행(이름·색·version + 동의 시각) 조회 — 프로필 편집기 + 동의 단계가 사용.
export function useMyProfile() {
  const { user } = useAuth()
  return useQuery<MyProfile | null>({
    queryKey: ['myProfile', user?.id],
    enabled: Boolean(user && isSupabaseConfigured),
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, color, version, location_consent_at, photo_consent_at')
        .eq('id', user.id)
        .maybeSingle()
      if (error || !data) return null
      return data
    },
  })
}
