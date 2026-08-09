import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { signAvatarPaths } from '@/lib/photos/signAvatars'
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
  /** 혼자 쓰는 중(ACTIVE인데 상대가 없음, 0024). 연결 CTA·'상대' UI 숨김의 단일 기준. */
  isSolo: boolean
  /** 아직 살아있는 내 초대 코드. 연결 화면이 **새로 만들지 않고** 그대로 보여주기 위한 값. */
  inviteCode: string | null
}

const EMPTY: CoupleInfo = {
  coupleId: null,
  status: null,
  userA: null,
  userB: null,
  connectedAt: null,
  partner: null,
  myRole: null,
  isSolo: false,
  inviteCode: null,
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
      const { data: rows, error } = await supabase
        .from('couples')
        .select('id, status, user_a, user_b, connected_at, invite_code, invite_expires_at')
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .neq('status', 'DISCONNECTED')
      if (error) return EMPTY
      // 여러 행이 나올 수 있다(옛 PENDING 초대를 남긴 채 상대 코드를 수락한 계정 등).
      // 예전엔 maybeSingle()이라 그 상태에서 **앱 전체가 미연결로 보였다.** ACTIVE를 우선한다.
      const list = rows ?? []
      const data = list.find((r) => r.status === 'ACTIVE') ?? list[0]
      if (!data) return EMPTY

      const base: CoupleInfo = {
        coupleId: data.id,
        status: data.status,
        userA: data.user_a,
        userB: data.user_b,
        connectedAt: data.connected_at,
        partner: null,
        myRole: data.user_a === user.id ? 'user_a' : 'user_b',
        isSolo: data.status === 'ACTIVE' && !data.user_b,
        // 만료된 코드는 없는 것으로 — 화면에 죽은 코드를 띄우지 않는다.
        inviteCode:
          data.invite_code && data.invite_expires_at && Date.parse(data.invite_expires_at) > Date.now()
            ? data.invite_code
            : null,
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
            // avatar_url은 Storage 경로다 — 서명하지 않으면 <img src>가 상대 경로로 깨진다.
            const signed = await signAvatarPaths([p.avatar_url])
            base.partner = {
              id: p.id,
              displayName: p.display_name,
              avatarUrl: p.avatar_url ? (signed[p.avatar_url] ?? null) : null,
              color: p.color,
            }
          }
        }
      }
      return base
    },
  })
}
