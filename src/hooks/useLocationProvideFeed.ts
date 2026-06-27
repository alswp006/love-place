import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { NotifyMode } from '@/lib/journey/types'
import { buildProvideFeed, type ProvideLogRow, type ProvideFeedItem } from '@/lib/journey/provideLog'

// 내 동선이 상대에게 제공(열람)된 사실을 인앱 통보(제19조). location_access_log의 PROVIDE 행(data_subject=나)을 도출.
export function useLocationProvideFeed(
  coupleId: string | null,
  userId: string | null,
  notifyMode: NotifyMode,
): { items: ProvideFeedItem[]; isLoading: boolean } {
  const q = useQuery<ProvideLogRow[]>({
    queryKey: ['provide-feed', coupleId, userId],
    enabled: Boolean(coupleId && userId && isSupabaseConfigured),
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
      const { data, error } = await supabase
        .from('location_access_log')
        .select('id, recipient_id, event_at, session_ref')
        .eq('data_subject_id', userId)
        .eq('event_type', 'PROVIDE')
        .gte('event_at', since)
        .order('event_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as ProvideLogRow[]
    },
  })

  const items = buildProvideFeed(q.data ?? [], { notifyMode, nowIso: new Date().toISOString() })
  return { items, isLoading: q.isLoading }
}
