import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'

export type PlaceRow = {
  id: string
  name: string
  address: string | null
  region_label: string | null
  lat: number | null
  lng: number | null
  category: string | null
  kakao_place_id: string | null
  added_by: string
}

// 우리 커플의 장소 목록(§5.2 위시 목록·§5.5 지도 마커 공용). RLS가 커플 격리.
export function usePlaces(coupleId: string | null) {
  return useQuery<PlaceRow[]>({
    queryKey: ['places', coupleId],
    enabled: Boolean(coupleId && isSupabaseConfigured),
    queryFn: async () => {
      if (!coupleId) return []
      const { data, error } = await supabase
        .from('places')
        .select('id, name, address, region_label, lat, lng, category, kakao_place_id, added_by')
        .eq('couple_id', coupleId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as PlaceRow[]
    },
  })
}
