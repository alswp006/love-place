import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'

// 캘린더 이벤트 목록(§5.1). RLS가 커플 격리 + visibility 다단계(0004). 실시간 전파 포함.
export type EventRow = {
  id: string
  title: string
  start: string
  end: string
  is_all_day: boolean
  time_zone: string
  visibility: 'SHARED' | 'PERSONAL'
  participants: 'OWNER_ONLY' | 'BOTH'
  owner_id: string
  place_id: string | null
  memo: string | null
  recurrence_rule: string | null
  reminders: { userId: string; offsetMinutes: number }[]
  version: number
}

export function useEvents(coupleId: string | null) {
  const queryClient = useQueryClient()

  const query = useQuery<EventRow[]>({
    queryKey: ['events', coupleId],
    enabled: Boolean(coupleId && isSupabaseConfigured),
    queryFn: async () => {
      if (!coupleId) return []
      const { data, error } = await supabase
        .from('events')
        .select(
          'id, title, start, end, is_all_day, time_zone, visibility, participants, owner_id, place_id, memo, recurrence_rule, reminders, version',
        )
        .eq('couple_id', coupleId)
        .is('deleted_at', null)
        .order('start', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as EventRow[]
    },
  })

  // 상대가 일정을 바꾸면 즉시 반영(web-stack §4.3). 채널 cleanup으로 누수 방지.
  useEffect(() => {
    if (!coupleId || !isSupabaseConfigured) return
    const channel = supabase
      .channel(`events:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: `couple_id=eq.${coupleId}` },
        () => queryClient.invalidateQueries({ queryKey: ['events', coupleId] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, queryClient])

  return query
}
