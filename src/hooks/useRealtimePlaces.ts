import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'

// 공유 자동 전파(§5.1·web-stack.md §4.3) — 상대가 places/wishes를 바꾸면 내 화면 즉시 갱신.
// Realtime 페이로드를 직접 머지하지 않고 관련 쿼리를 무효화(서버가 정본, race 단순화).
// RLS가 Realtime에도 적용되어 타 커플 변경은 수신되지 않는다.
export function useRealtimePlaces(coupleId: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!coupleId || !isSupabaseConfigured) return

    const channel = supabase
      .channel(`places:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'places', filter: `couple_id=eq.${coupleId}` },
        () => queryClient.invalidateQueries({ queryKey: ['places', coupleId] }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wishes', filter: `couple_id=eq.${coupleId}` },
        () => queryClient.invalidateQueries({ queryKey: ['wishes', coupleId] }),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, queryClient])
}
