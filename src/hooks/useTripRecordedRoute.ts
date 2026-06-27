import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { useRecordedRoute, type RecordedRoute } from './useRecordedRoute'

// 여행의 기록 동선 — 해당 trip의 점이 있는 최신 세션을 찾아 그 동선(get_session_points)을 돌려준다.
// recap에서 실측 폴리라인 우선 표시용(없으면 호출측이 측지선/스냅 fallback).
export function useTripRecordedRoute(
  coupleId: string | null,
  tripId: string | null | undefined,
): RecordedRoute {
  const sess = useQuery<string | null>({
    queryKey: ['trip-recorded-session', coupleId, tripId],
    enabled: Boolean(coupleId && tripId && isSupabaseConfigured),
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_sessions')
        .select('id, point_count')
        .eq('trip_id', tripId)
        .is('deleted_at', null)
        .gt('point_count', 0)
        .order('started_at', { ascending: false })
        .limit(1)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as { id: string }[]
      return rows[0]?.id ?? null
    },
  })

  return useRecordedRoute(coupleId, sess.data ?? null)
}
