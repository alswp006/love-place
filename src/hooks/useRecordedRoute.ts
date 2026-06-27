import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { parseRoutePoints, type RoutePoint } from '@/lib/journey/types'
import { orderedRoute, recordedDistanceKm } from '@/lib/recap/routeStats'
import { simplifyPath, type LatLng } from '@/lib/recap/simplify'

export type RecordedRoute = {
  points: RoutePoint[]
  polyline: LatLng[]
  distanceKm: number
  isLoading: boolean
}

// 기록 동선 read — get_session_points RPC(복호)로 점을 받아 정렬·단순화·실측거리 도출(설계 §2.2).
// 좌표는 암호화라 realtime payload가 무의미 → trip_sessions 변경을 구독해 쿼리 무효화로 일원화
// (web-stack §4.3: payload 직접 머지 금지, 서버 정본·invalidate).
export function useRecordedRoute(
  coupleId: string | null,
  sessionId: string | null | undefined,
): RecordedRoute {
  const qc = useQueryClient()
  const q = useQuery<RoutePoint[]>({
    queryKey: ['recorded-route', coupleId, sessionId],
    enabled: Boolean(coupleId && sessionId && isSupabaseConfigured),
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_session_points', { p_session: sessionId })
      if (error) throw new Error(error.message)
      return orderedRoute(parseRoutePoints(data))
    },
  })

  useEffect(() => {
    if (!coupleId || !sessionId || !isSupabaseConfigured) return
    const ch = supabase
      .channel(`trip_sessions:${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trip_sessions', filter: `id=eq.${sessionId}` },
        () => {
          void qc.invalidateQueries({ queryKey: ['recorded-route', coupleId, sessionId] })
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [coupleId, sessionId, qc])

  const points = q.data ?? []
  const polyline = useMemo(() => simplifyPath(points), [points])
  const distanceKm = useMemo(() => recordedDistanceKm(points), [points])

  return { points, polyline, distanceKm, isLoading: q.isLoading }
}
