import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { useAuth } from '@/state/auth'

export type Partner = {
  id: string
  displayName: string
  avatarUrl: string | null
  color: string
}

export type CoupleInfo = {
  coupleId: string | null
  status: 'PENDING' | 'ACTIVE' | 'DISCONNECTED' | null
  userA: string | null
  userB: string | null
  connectedAt: string | null
  partner: Partner | null // ACTIVE일 때만 채움
  myRole: 'user_a' | 'user_b' | null // 호출자 역할(초대자=user_a) — 역할 기본색·동의 흐름이 참조(dossier 02 §3)
}

const EMPTY: CoupleInfo = {
  coupleId: null,
  status: null,
  userA: null,
  userB: null,
  connectedAt: null,
  partner: null,
  myRole: null,
}

// 현재 사용자의 커플 상태 + (ACTIVE면) 상대 프로필(§4.2). 라우트 가드·우리 탭이 사용.
export function useCouple() {
  const { user } = useAuth()
  return useQuery<CoupleInfo>({
    queryKey: ['couple', user?.id],
    enabled: Boolean(user && isSupabaseConfigured),
    queryFn: async () => {
      if (!user) return EMPTY
      // PENDING도 봐야 "내 초대 대기중" UI를 그림 → DISCONNECTED만 제외.
      const { data, error } = await supabase
        .from('couples')
        .select('id, status, user_a, user_b, connected_at')
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .neq('status', 'DISCONNECTED')
        .maybeSingle()
      if (error || !data) return EMPTY

      const base: CoupleInfo = {
        coupleId: data.id,
        status: data.status,
        userA: data.user_a,
        userB: data.user_b,
        connectedAt: data.connected_at,
        partner: null,
        myRole: data.user_a === user.id ? 'user_a' : 'user_b',
      }

      // ACTIVE면 상대 프로필 조회(0004 profiles_self_or_partner_select가 허용).
      if (data.status === 'ACTIVE') {
        const partnerId = data.user_a === user.id ? data.user_b : data.user_a
        if (partnerId) {
          const { data: p } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, color')
            .eq('id', partnerId)
            .maybeSingle()
          if (p) {
            base.partner = {
              id: p.id,
              displayName: p.display_name,
              avatarUrl: p.avatar_url,
              color: p.color,
            }
          }
        }
      }
      return base
    },
  })
}
