import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { LatLng } from '@/lib/recap/sharePath'

// 커플의 **모든 실측 궤적**을 한 번에 — 전국 지도와 여행 지도가 진짜 이동 경로를 그리게(0025).
//
// 왜 일괄인가: 좌표를 읽는 길은 원래 세션 하나짜리 RPC뿐이었다. 1년치면 수십 번이라
// 카드 한 장 그리는 데 쓸 수 없다. 서버가 세션별로 솎아 한 번에 준다.
//
// 서버가 지키는 것(클라가 아니라 서버다): 내 커플만, 상대 세션은 제3자 제공 동의가 있을 때만,
// 내려준 상대 세션은 PROVIDE 확인자료로 기록(제19조). 동의 안 한 세션은 조용히 빠진다 —
// 그거 하나 때문에 지도 전체가 실패하면 안 된다.

export type RouteTrace = {
  sessionId: string
  /** 여행에 연결된 세션이면 그 여행 id. 고아 세션(그냥 데이트)이면 null. */
  tripId: string | null
  startedAt: string
  points: LatLng[]
}

type Row = {
  session_id: string
  trip_id: string | null
  started_at: string
  seq: number
  lat: number
  lng: number
}

function isRow(v: unknown): v is Row {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    typeof r.session_id === 'string' &&
    typeof r.started_at === 'string' &&
    Number.isFinite(r.lat) &&
    Number.isFinite(r.lng)
  )
}

export function useCoupleRoutes(coupleId: string | null) {
  return useQuery<RouteTrace[]>({
    queryKey: ['couple-routes', coupleId],
    enabled: Boolean(coupleId && isSupabaseConfigured),
    // 끝난 여행의 궤적은 변하지 않는다 — 지도를 열 때마다 복호를 다시 시키지 않는다.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!coupleId) return []
      const { data, error } = await supabase.rpc('get_couple_route_polylines', { p_max_points: 120 })
      if (error) throw new Error(error.message)

      // 경계에서 검증하고 쓴다(외부 응답을 그대로 믿지 않는다).
      const rows = (Array.isArray(data) ? data : []).filter(isRow)
      const bySession = new Map<string, RouteTrace>()
      for (const r of rows) {
        const t = bySession.get(r.session_id)
        if (t) t.points.push({ lat: r.lat, lng: r.lng })
        else
          bySession.set(r.session_id, {
            sessionId: r.session_id,
            tripId: r.trip_id,
            startedAt: r.started_at,
            points: [{ lat: r.lat, lng: r.lng }],
          })
      }
      // 점 하나짜리 세션은 선이 못 된다 — 지도에 그릴 게 없으므로 뺀다.
      return [...bySession.values()].filter((t) => t.points.length >= 2)
    },
  })
}
