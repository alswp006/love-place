import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { softDelete } from '@/lib/sync/versionedUpdate'

// Trips(여행 묶음 §5.3) — 가본 곳(visits)을 여행 단위로. cover_photo는 P3c(사진앨범, needs-supabase) 후.
export type TripRow = {
  id: string
  title: string
  start_date: string
  end_date: string
  region_code: string | null
  version: number
}

export function useTrips(coupleId: string | null) {
  const queryClient = useQueryClient()
  const query = useQuery<TripRow[]>({
    queryKey: ['trips', coupleId],
    enabled: Boolean(coupleId && isSupabaseConfigured),
    queryFn: async () => {
      if (!coupleId) return []
      const { data, error } = await supabase
        .from('trips')
        .select('id, title, start_date, end_date, region_code, version')
        .eq('couple_id', coupleId)
        .is('deleted_at', null)
        .order('start_date', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as TripRow[]
    },
  })

  useEffect(() => {
    if (!coupleId || !isSupabaseConfigured) return
    const channel = supabase
      .channel(`trips:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips', filter: `couple_id=eq.${coupleId}` },
        () => queryClient.invalidateQueries({ queryKey: ['trips', coupleId] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, queryClient])

  return query
}

export type NewTrip = { title: string; startDate: string; endDate: string; regionCode?: string | null }

export function useCreateTrip(coupleId: string | null, myId: string | null) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, NewTrip>({
    mutationFn: async (t) => {
      if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
      const { error } = await supabase.from('trips').insert({
        couple_id: coupleId,
        title: t.title,
        start_date: t.startDate,
        end_date: t.endDate,
        region_code: t.regionCode ?? null,
        created_by: myId,
        updated_by: myId,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['trips', coupleId] }),
  })
}

export function useDeleteTrip(coupleId: string | null, myId: string | null) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { id: string; expectedVersion: number }>({
    mutationFn: async ({ id, expectedVersion }) => {
      if (!myId) throw new Error('로그인이 필요해요.')
      await softDelete('trips', id, expectedVersion, myId) // 휴지통(soft-delete); 충돌은 조용히 무시(목록 재조회로 정정)
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['trips', coupleId] }),
  })
}
