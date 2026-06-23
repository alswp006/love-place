import { useMemo } from 'react'
import { useTrips, type TripRow } from './useTrips'
import { useVisits } from './useVisits'
import { usePlaces, type PlaceRow } from './usePlaces'
import {
  orderedVertices,
  recapStats,
  type RecapVertex,
  type RecapStats,
} from '@/lib/recap/recapStats'

export type TripRecap = {
  trip: TripRow | null
  vertices: RecapVertex[]
  stats: RecapStats
  isLoading: boolean
}

// 여행 리캡 read-model — 기존 커플 단위 쿼리(trips/visits/places, 캐시됨)에서 클라이언트 도출.
// 새 테이블/쿼리 없음(spec §3.3). tripId의 방문을 시간순 정점으로 + haversine 거리·스탯.
export function useTripRecap(coupleId: string | null, tripId: string | null | undefined): TripRecap {
  const trips = useTrips(coupleId)
  const visits = useVisits(coupleId)
  const places = usePlaces(coupleId)

  const trip = useMemo(
    () => (trips.data ?? []).find((t) => t.id === tripId) ?? null,
    [trips.data, tripId],
  )

  const vertices = useMemo(() => {
    if (!tripId) return []
    const byId: Record<string, PlaceRow> = {}
    for (const p of places.data ?? []) byId[p.id] = p
    const tripVisits = (visits.data ?? []).filter((v) => v.trip_id === tripId)
    return orderedVertices(tripVisits, byId)
  }, [visits.data, places.data, tripId])

  const stats = useMemo(() => recapStats(vertices, trip), [vertices, trip])

  return { trip, vertices, stats, isLoading: trips.isLoading || visits.isLoading || places.isLoading }
}
