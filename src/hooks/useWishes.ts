import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { WishInfo } from '@/lib/places/wishStatus'

// place별 찜 집계(배지·정렬) + 내 위시 상세(우선순위 컨트롤용 id/priority/version)를 한 쿼리로.
// 키 ['wishes', coupleId] — useRealtimePlaces가 wishes 변경 시 무효화하므로 실시간 자동 반영. RLS가 커플 격리.
export type WishMap = Record<string, WishInfo>
/** 내(myId) 위시 행 — 우선순위 변경은 낙관적 락(version 조건부)에 version이 필요. */
export type MyWish = { wishId: string; priority: number; version: number }
export type WishData = { byPlace: WishMap; mine: Record<string, MyWish> }

const EMPTY: WishData = { byPlace: {}, mine: {} }

export function useWishes(coupleId: string | null, myId: string | null) {
  return useQuery<WishData>({
    queryKey: ['wishes', coupleId],
    enabled: Boolean(coupleId && isSupabaseConfigured),
    queryFn: async () => {
      if (!coupleId) return EMPTY
      const { data, error } = await supabase
        .from('wishes')
        .select('id, place_id, user_id, priority, version')
        .eq('couple_id', coupleId)
        .is('deleted_at', null)
      if (error) throw new Error(error.message)

      const byPlace: WishMap = {}
      const mine: Record<string, MyWish> = {}
      for (const row of data ?? []) {
        const cur = byPlace[row.place_id] ?? { userIds: [], totalPriority: 0, maxPriority: 0 }
        if (!cur.userIds.includes(row.user_id)) cur.userIds.push(row.user_id)
        const pr = row.priority ?? 0
        cur.totalPriority += pr
        if (pr > cur.maxPriority) cur.maxPriority = pr
        byPlace[row.place_id] = cur
        if (myId && row.user_id === myId) {
          mine[row.place_id] = { wishId: row.id, priority: pr, version: row.version }
        }
      }
      return { byPlace, mine }
    },
  })
}
