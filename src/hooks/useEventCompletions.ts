import { useEffect, useId } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { softDelete } from '@/lib/sync/versionedUpdate'
import { useOfflineQueue } from '@/state/OfflineQueueProvider'

// 일정 완료 기록(0021) — 체크 = 행 추가, 해제 = soft-delete.
//
// 반복 일정 때문에 회차(occurrence_start) 단위로 기록한다. events에 done 플래그를 두면
// "매일 운동"을 한 번 체크하는 순간 모든 회차가 완료돼 잔디가 거짓말을 한다.
//
// 잔디·여정은 이 표에서 도출한다(집계 테이블 없음, §7).

export type CompletionRow = {
  id: string
  event_id: string
  occurrence_start: string
  done_at: string
  version: number
  created_by: string
}

/** 회차 하나를 가리키는 키 — 목록 렌더가 "이거 완료됐나"를 O(1)로 묻게. */
export function occurrenceKey(eventId: string, occurrenceStart: string): string {
  return `${eventId}@${occurrenceStart}`
}

export function useEventCompletions(coupleId: string | null) {
  const queryClient = useQueryClient()
  // 채널 토픽 중복(같은 페이지에서 훅이 두 번 쓰이는 경우) 방지 — 0020에서 크래시했던 경로.
  const channelKey = useId()

  const query = useQuery<CompletionRow[]>({
    queryKey: ['event-completions', coupleId],
    enabled: Boolean(coupleId && isSupabaseConfigured),
    queryFn: async () => {
      if (!coupleId) return []
      const { data, error } = await supabase
        .from('event_completions')
        .select('id, event_id, occurrence_start, done_at, version, created_by')
        .eq('couple_id', coupleId)
        .is('deleted_at', null)
      if (error) throw new Error(error.message)
      return (data ?? []) as CompletionRow[]
    },
  })

  useEffect(() => {
    if (!coupleId || !isSupabaseConfigured) return
    const ch = supabase
      .channel(`event_completions:${coupleId}:${channelKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_completions',
          filter: `couple_id=eq.${coupleId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ['event-completions', coupleId] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [coupleId, queryClient, channelKey])

  return query
}

/**
 * 회차 완료 토글.
 *
 * 낙관적 업데이트를 쓴다 — 체크는 즉각 반응해야 하는 동작이고, 그래야 잔디가 자라는 모션도
 * 네트워크를 기다리지 않는다. 실패하면 스냅샷으로 되돌린다(무음 덮어쓰기 금지 §4.3).
 */
export function useToggleEventDone(coupleId: string | null, myId: string | null) {
  const queryClient = useQueryClient()
  const { enqueue } = useOfflineQueue()
  const key = ['event-completions', coupleId]

  return useMutation<
    void,
    Error,
    { eventId: string; occurrenceStart: string; done: boolean },
    { prev: CompletionRow[] | undefined }
  >({
    mutationFn: async ({ eventId, occurrenceStart, done }) => {
      if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        // 재연결 시점의 실제 상태로 토글한다(방향을 큐에 고정하지 않음 — wish.toggle과 동형).
        await enqueue(
          'event.done',
          { coupleId, eventId, occurrenceStart, myId },
          `event.done:${eventId}:${occurrenceStart}`,
        )
        return
      }
      // stale-cache race 회피 — 살아있는 행을 직접 재조회한다.
      const { data: live, error: selErr } = await supabase
        .from('event_completions')
        .select('id, version')
        .eq('couple_id', coupleId)
        .eq('event_id', eventId)
        .eq('occurrence_start', occurrenceStart)
        .is('deleted_at', null)
        .limit(1)
      if (selErr) throw new Error(selErr.message)
      const row = (live ?? [])[0] as { id: string; version: number } | undefined

      if (!done) {
        if (!row) return // 이미 해제됨 — 재생 안전
        const res = await softDelete('event_completions', row.id, row.version, myId)
        if (res.status === 'conflict') throw new Error('상대가 먼저 바꿨어요. 다시 확인해 주세요.')
        return
      }
      if (row) return // 이미 완료됨 — 유니크 위반 대신 no-op
      const { error } = await supabase.from('event_completions').insert({
        couple_id: coupleId,
        event_id: eventId,
        occurrence_start: occurrenceStart,
        created_by: myId,
        updated_by: myId,
      })
      if (error) throw new Error(error.message)
    },
    onMutate: async ({ eventId, occurrenceStart, done }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const prev = queryClient.getQueryData<CompletionRow[]>(key)
      queryClient.setQueryData<CompletionRow[]>(key, (old) => {
        const list = old ?? []
        const without = list.filter(
          (c) => !(c.event_id === eventId && c.occurrence_start === occurrenceStart),
        )
        if (!done) return without
        return [
          ...without,
          {
            // 낙관적 행 — 서버 응답이 오면 invalidate가 진짜 id로 갈아끼운다.
            id: `optimistic:${eventId}:${occurrenceStart}`,
            event_id: eventId,
            occurrence_start: occurrenceStart,
            done_at: new Date().toISOString(),
            version: 1,
            created_by: myId ?? '',
          },
        ]
      })
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) queryClient.setQueryData(key, ctx.prev)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}
