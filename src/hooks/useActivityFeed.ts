import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { buildActivityFeed, type ActivityItem, type ActivitySource } from '@/lib/feed/activityFeed'

// 인앱 활동 피드(ux §6 — 1차 알림 수단). 상대가 최근에 추가/기록한 것.
//
// 표시 훅(usePlaces/useWishes/useReactions…)을 재사용하지 않는 이유:
//   그 훅들은 화면에 필요한 컬럼만 뽑거나(created_at 없음) 집계하며 행을 버린다
//   (useWishes → {byPlace, mine}, useReactions → {count, didIReact}).
//   피드 때문에 그 반환 형태를 바꾸면 호출부가 전부 흔들리므로 **전용 쿼리**를 둔다.
//
// 범위: 추가·기록까지. 삭제/변경은 구조적으로 못 만든다(activityFeed.ts 주석 참조).

const PER_TABLE = 10 // 테이블당 최근 N건만 — 합쳐서 정렬 후 잘라낸다

type Row = { id: string; created_at: string; created_by: string }

export function useActivityFeed(coupleId: string | null, myId: string | null) {
  return useQuery<ActivityItem[]>({
    queryKey: ['activity-feed', coupleId, myId],
    enabled: Boolean(coupleId && isSupabaseConfigured),
    staleTime: 1000 * 60, // 신호라 조금 늦어도 된다 — 과도한 재조회 회피
    queryFn: async () => {
      if (!coupleId) return []
      const recent = (table: string, nameCol: string) =>
        supabase
          .from(table)
          .select(`id, ${nameCol}, created_at, created_by`)
          .eq('couple_id', coupleId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(PER_TABLE)

      // 한 테이블이 실패해도 피드 전체가 죽지 않게(allSettled) — 신호는 best-effort다.
      const [places, visits, trips, events, comments] = await Promise.allSettled([
        recent('places', 'name'),
        // visits는 자체 이름이 없어 조인으로 장소명을 끌어온다.
        supabase
          .from('visits')
          .select('id, created_at, created_by, places(name)')
          .eq('couple_id', coupleId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(PER_TABLE),
        recent('trips', 'title'),
        recent('events', 'title'),
        recent('comments', 'body'),
      ])

      const sources: ActivitySource[] = []
      const push = (
        settled: PromiseSettledResult<{ data: unknown; error: unknown }>,
        kind: ActivitySource['kind'],
        pick: (r: Record<string, unknown>) => string | null,
      ) => {
        if (settled.status !== 'fulfilled' || settled.value.error) return
        for (const raw of (settled.value.data ?? []) as Record<string, unknown>[]) {
          const r = raw as unknown as Row
          sources.push({ id: r.id, kind, name: pick(raw), createdAt: r.created_at, createdBy: r.created_by })
        }
      }

      push(places, 'place', (r) => (r.name as string | null) ?? null)
      push(visits, 'visit', (r) => {
        // PostgREST 조인은 객체 또는 배열로 올 수 있다 — 둘 다 받는다.
        const p = r.places as { name?: string } | { name?: string }[] | null
        const one = Array.isArray(p) ? p[0] : p
        return one?.name ?? null
      })
      push(trips, 'trip', (r) => (r.title as string | null) ?? null)
      push(events, 'event', (r) => (r.title as string | null) ?? null)
      push(comments, 'comment', (r) => (r.body as string | null) ?? null)

      return buildActivityFeed(sources, myId)
    },
  })
}
