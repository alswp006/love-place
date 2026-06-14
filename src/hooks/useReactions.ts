import { useQuery } from '@tanstack/react-query'
import { isSupabaseConfigured } from '@/lib/supabase/client'

// 리액션 집계 — place별 { count, didIReact }. 실제 구현은 P-D Task 12에서 채운다.
export type ReactionAgg = { count: number; didIReact: boolean }
export type ReactionMap = Record<string, ReactionAgg>

export function useReactions(coupleId: string | null, _myId: string | null) {
  return useQuery<ReactionMap>({
    queryKey: ['reactions', coupleId],
    enabled: Boolean(coupleId && isSupabaseConfigured),
    queryFn: async () => ({}),
  })
}
