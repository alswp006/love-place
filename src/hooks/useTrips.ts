import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { useSoftDeleteWithUndo } from '@/hooks/useTrash'

// Trips(여행 묶음 §5.3) — 가본 곳(visits)을 여행 단위로. cover_photo는 P3c(사진앨범, needs-supabase) 후.
export type TripRow = {
  id: string
  title: string
  start_date: string
  end_date: string
  region_code: string | null
  version: number
}

let tripsChannelSeq = 0 // 채널 토픽 유일화 카운터(위 주석 참조)

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
    // 토픽은 훅 인스턴스별로 유일하게 — supabase.channel()은 같은 토픽이면 기존 인스턴스를 돌려주므로,
    // 이미 subscribe()된 채널에 .on()을 또 붙이다 throw한다(한 화면에 useTrips 구독자 2개면 크래시).
    const channel = supabase
      .channel(`trips:${coupleId}:${++tripsChannelSeq}`)
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
  // 생성된 trip id 반환 — '동선으로 여행 만들기'(생성→즉시 연결 원탭)가 이어서 쓴다.
  return useMutation<string, Error, NewTrip>({
    mutationFn: async (t) => {
      if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
      const { data, error } = await supabase
        .from('trips')
        .insert({
          couple_id: coupleId,
          title: t.title,
          start_date: t.startDate,
          end_date: t.endDate,
          region_code: t.regionCode ?? null,
          created_by: myId,
          updated_by: myId,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      return (data as { id: string }).id
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['trips', coupleId] }),
  })
}

// 여행 삭제 — R1.5 즉시 '되돌리기' Undo(Task 18). 공용 헬퍼 useSoftDeleteWithUndo('trips')로 위임해
// 삭제 성공 시 "여행을 삭제했어요" + 되돌리기 토스트, 충돌은 조용히 무시(목록 재조회로 정정). 호출 측 call shape({id,expectedVersion}) 유지.
export function useDeleteTrip(coupleId: string | null, myId: string | null) {
  const { deleteWithUndo, isPending } = useSoftDeleteWithUndo('trips', coupleId, myId, () => {})
  return {
    mutate: (vars: { id: string; expectedVersion: number }) => void deleteWithUndo(vars),
    isPending,
  }
}
