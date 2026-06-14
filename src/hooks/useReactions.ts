import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import {
  aggregateReactions,
  type ReactionRow,
  type ReactionMap,
  type ReactionAgg,
} from '@/lib/places/aggregateReactions'

// ❤️ 리액션 — "누가 눌렀나"(개인 의도). 읽기는 커플 전체(상대 것 포함), 쓰기는 본인만(0009 RLS).
// 켜기=insert, 끄기=soft-delete(deleted_at). 물리삭제 금지(rule §4). 키 ['reactions', coupleId].
export type { ReactionMap, ReactionAgg }

export function useReactions(coupleId: string | null, myId: string | null) {
  const queryClient = useQueryClient()

  const query = useQuery<ReactionMap>({
    queryKey: ['reactions', coupleId],
    enabled: Boolean(coupleId && isSupabaseConfigured),
    queryFn: async () => {
      if (!coupleId) return {}
      const { data, error } = await supabase
        .from('reactions')
        .select('id, target_id, user_id, emoji, version')
        .eq('couple_id', coupleId)
        .eq('target_type', 'PLACE')
        .is('deleted_at', null)
      if (error) throw new Error(error.message)
      return aggregateReactions((data ?? []) as ReactionRow[], myId)
    },
  })

  useEffect(() => {
    if (!coupleId || !isSupabaseConfigured) return
    const channel = supabase
      .channel(`reactions:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reactions', filter: `couple_id=eq.${coupleId}` },
        () => queryClient.invalidateQueries({ queryKey: ['reactions', coupleId] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, queryClient])

  return query
}

// ❤️ 토글 — 내 살아있는 리액션이 없으면 insert, 있으면 soft-delete(본인 행만 — reactions_update).
export function useToggleReaction(coupleId: string | null, myId: string | null) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { placeId: string }>({
    mutationFn: async ({ placeId }) => {
      if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
      // stale-cache race 회피 — mutationFn에서 내 살아있는 리액션을 직접 조회.
      const { data: mine, error: selErr } = await supabase
        .from('reactions')
        .select('id')
        .eq('couple_id', coupleId)
        .eq('target_type', 'PLACE')
        .eq('target_id', placeId)
        .eq('user_id', myId)
        .is('deleted_at', null)
        .limit(1)
      if (selErr) throw new Error(selErr.message)
      const existing = mine?.[0]?.id
      if (existing) {
        const { error } = await supabase
          .from('reactions')
          .update({ deleted_at: new Date().toISOString(), updated_by: myId })
          .eq('id', existing)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('reactions').insert({
          couple_id: coupleId,
          user_id: myId,
          target_type: 'PLACE',
          target_id: placeId,
          emoji: '❤️',
          created_by: myId,
          updated_by: myId,
        })
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reactions', coupleId] })
    },
  })
}
