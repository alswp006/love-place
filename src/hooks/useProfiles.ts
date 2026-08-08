import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { signAvatarPaths } from '@/lib/photos/signAvatars'

// 커플 두 멤버의 프로필(출처 아바타·색 표시용). RLS profiles_self_or_partner_select가 양측 읽기 허용(0004).
//
// avatar_url 컬럼에는 **Storage 경로**가 들어간다(공개 URL이 아니다 — photos 버킷은 비공개다, 0022).
// 그래서 여기서 한 번에 서명해 avatarUrl로 내려준다. 아바타는 지도·캘린더·댓글 등 앱 전역에
// 깔리므로, 화면마다 서명하면 요청이 폭발한다. 커플당 두 장이니 한 쿼리에서 같이 끝낸다.
export type ProfileLite = {
  id: string
  displayName: string
  color: string
  /** 표시용 서명 URL. 오프라인·서명 실패 시 null → 이니셜+색으로 폴백한다. */
  avatarUrl: string | null
  /** 원본 Storage 경로(편집기가 '지금 사진이 있나'를 판단하고 교체 시 옛 파일을 지울 때 쓴다). */
  avatarPath: string | null
}
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
      const rows = data ?? []

      const signed = await signAvatarPaths(rows.map((r) => r.avatar_url))

      const map: ProfileMap = {}
      for (const row of rows) {
        map[row.id] = {
          id: row.id,
          displayName: row.display_name,
          color: row.color,
          avatarUrl: row.avatar_url ? (signed[row.avatar_url] ?? null) : null,
          avatarPath: row.avatar_url,
        }
      }
      return map
    },
  })
}
