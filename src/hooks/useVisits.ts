import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { dayKey } from '@/lib/calendar/eventDays'
import { softDelete } from '@/lib/sync/versionedUpdate'

// 방문(가봤음) — "상태 플래그가 아니라 기록 추가"(§5.3·CLAUDE.md §7). 같은 장소 재방문은 각각 행.
// "가봤음 = visits 존재"로 도출(마커 채운 별). 키 ['visits', coupleId], realtime 전파.
export type VisitRow = {
  id: string
  place_id: string
  trip_id: string | null
  visit_date: string | null
  rating: number | null
  memo: string | null
  version: number
}

export function useVisits(coupleId: string | null) {
  const queryClient = useQueryClient()

  const query = useQuery<VisitRow[]>({
    queryKey: ['visits', coupleId],
    enabled: Boolean(coupleId && isSupabaseConfigured),
    queryFn: async () => {
      if (!coupleId) return []
      const { data, error } = await supabase
        .from('visits')
        .select('id, place_id, trip_id, visit_date, rating, memo, version')
        .eq('couple_id', coupleId)
        .is('deleted_at', null)
        .order('visit_date', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as VisitRow[]
    },
  })

  useEffect(() => {
    if (!coupleId || !isSupabaseConfigured) return
    const channel = supabase
      .channel(`visits:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'visits', filter: `couple_id=eq.${coupleId}` },
        () => queryClient.invalidateQueries({ queryKey: ['visits', coupleId] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, queryClient])

  return query
}

// "다녀왔어요" — 방문 기록 추가(insert). 마커가 가봤음으로 도출 전환(§5.3).
export function useMarkVisited(coupleId: string | null, myId: string | null) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { placeId: string; visitDate?: string }>({
    mutationFn: async ({ placeId, visitDate }) => {
      if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
      const { error } = await supabase.from('visits').insert({
        couple_id: coupleId,
        place_id: placeId,
        visit_date: visitDate ?? dayKey(new Date().toISOString()),
        created_by: myId,
        updated_by: myId,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['visits', coupleId] })
      void queryClient.invalidateQueries({ queryKey: ['places', coupleId] })
    },
  })
}

// "가봤음 취소"(토글) — 해당 place의 활성 방문행(들)을 soft-delete(deleted_at). 낙관적 락(§4.3):
// version 조건부 softDelete가 0행이면 충돌 → onConflict(무음 덮어쓰기 금지). 여러 행이면 모두 처리해야
// "가봤음"(visits 존재) 도출이 해제된다. realtime visits:${coupleId}가 양측에 전파.
export function useUnmarkVisited(
  coupleId: string | null,
  myId: string | null,
  onConflict: () => void,
) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { placeId: string; visits: VisitRow[] }>({
    mutationFn: async ({ placeId, visits }) => {
      if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
      const active = visits.filter((v) => v.place_id === placeId)
      if (active.length === 0) return
      let conflicted = false
      for (const v of active) {
        const res = await softDelete('visits', v.id, v.version, myId)
        if (res.status === 'conflict') conflicted = true
      }
      if (conflicted) onConflict()
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['visits', coupleId] })
      void queryClient.invalidateQueries({ queryKey: ['places', coupleId] })
    },
  })
}
