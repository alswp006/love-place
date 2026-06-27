import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { versionedUpdate, ConflictError } from '@/lib/sync/versionedUpdate'
import type { TripSession } from '@/lib/journey/types'

// 미연결 동선(고아 세션) — trip_id 없이 종료된 기록. /us 컨트롤 센터 트레이에서 노출·재연결.
// 14일 경과 시 purge_orphan_sessions(좌표만, 확인자료 보존)가 자동 파기 — 목적 없는 위치데이터 체류 최소화.
export function useOrphanSessions(coupleId: string | null) {
  return useQuery<TripSession[]>({
    queryKey: ['orphan-sessions', coupleId],
    enabled: Boolean(coupleId && isSupabaseConfigured),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_sessions')
        .select('*')
        .is('trip_id', null)
        .is('deleted_at', null)
        .eq('status', 'DONE')
        .gt('point_count', 0)
        .order('ended_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as TripSession[]
    },
  })
}

// 고아 세션을 여행에 연결(trip_id 지정) — 낙관적 락. 연결되면 해당 여행 recap에 동선이 나타난다.
export function useLinkSessionToTrip(coupleId: string | null, userId: string | null) {
  const qc = useQueryClient()
  const m = useMutation<void, Error, { id: string; version: number; tripId: string }>({
    mutationFn: async ({ id, version, tripId }) => {
      if (!userId) throw new Error('로그인이 필요해요.')
      const r = await versionedUpdate('trip_sessions', id, version, {
        trip_id: tripId,
        updated_by: userId,
      })
      if (r.status === 'conflict') throw new ConflictError()
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['orphan-sessions', coupleId] })
      void qc.invalidateQueries({ queryKey: ['trip-recorded-session', coupleId] })
    },
  })
  return { link: m.mutateAsync, isPending: m.isPending }
}
