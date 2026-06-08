import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { useAuth } from '@/state/auth'

export type CoupleInfo = {
  coupleId: string | null
  status: 'PENDING' | 'ACTIVE' | 'DISCONNECTED' | null
}

// 현재 사용자의 커플 상태. ACTIVE면 coupleId로 데이터 저장/조회 가능(§4.2).
// 아직 연결 전(PENDING/null)이면 장소 저장 흐름이 "먼저 연결" 안내로 분기.
export function useCouple() {
  const { user } = useAuth()
  return useQuery<CoupleInfo>({
    queryKey: ['couple', user?.id],
    enabled: Boolean(user && isSupabaseConfigured),
    queryFn: async () => {
      if (!user) return { coupleId: null, status: null }
      const { data, error } = await supabase
        .from('couples')
        .select('id, status')
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .neq('status', 'DISCONNECTED')
        .maybeSingle()
      if (error || !data) return { coupleId: null, status: null }
      return { coupleId: data.id, status: data.status }
    },
  })
}
