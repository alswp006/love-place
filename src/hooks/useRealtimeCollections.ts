import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'

// 공유 자동 전파(§5.1·web-stack.md §4.3) — 상대가 컬렉션/장소-목록 소속을 바꾸면 내 화면 즉시 갱신.
// Realtime 페이로드를 직접 머지하지 않고 관련 쿼리를 무효화(서버가 정본, race 단순화).
// RLS가 Realtime에도 적용되어 타 커플 변경은 수신되지 않는다. 채널은 훅에서 생성, cleanup에서 removeChannel(누수 금지).
export function useRealtimeCollections(coupleId: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!coupleId || !isSupabaseConfigured) return

    const channel = supabase
      .channel(`collections:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'collections', filter: `couple_id=eq.${coupleId}` },
        () => queryClient.invalidateQueries({ queryKey: ['collections', coupleId] }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'place_collections', filter: `couple_id=eq.${coupleId}` },
        () => queryClient.invalidateQueries({ queryKey: ['place_collections', coupleId] }),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, queryClient])
}
