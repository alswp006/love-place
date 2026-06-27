import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { versionedUpdate, ConflictError } from '@/lib/sync/versionedUpdate'
import type { TripSession } from '@/lib/journey/types'

// R6 기록 세션 — 시작/일시중지/재개/종료. 시작은 동의 게이트(canRecord), 상태변경은 낙관적 락(version).
// 설계 §5[2](동의 없이 수집 금지) / web-stack §4.4(LWW 금지 — 0행=충돌).

/** 해당 여행의 진행중(RECORDING/PAUSED) 세션 1건. 없으면 null. */
export function useActiveSession(coupleId: string | null, tripId: string | null | undefined) {
  return useQuery<TripSession | null>({
    queryKey: ['trip-session', coupleId, tripId],
    enabled: Boolean(coupleId && tripId && isSupabaseConfigured),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_sessions')
        .select('*')
        .eq('trip_id', tripId)
        .is('deleted_at', null)
        .in('status', ['RECORDING', 'PAUSED'])
        .order('started_at', { ascending: false })
        .limit(1)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as TripSession[]
      return rows[0] ?? null
    },
  })
}

export function useTripSession(
  coupleId: string | null,
  userId: string | null,
  tripId: string | null | undefined,
  opts: { canRecord: boolean },
) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['trip-session', coupleId, tripId] })

  const start = useMutation<string, Error, void>({
    mutationFn: async () => {
      if (!coupleId || !userId) throw new Error('연결이 필요해요.')
      if (!opts.canRecord) throw new Error('위치 수집·이용 동의가 필요해요.') // 설계 §5[2]
      const { data, error } = await supabase
        .from('trip_sessions')
        .insert({
          couple_id: coupleId,
          trip_id: tripId ?? null,
          owner_id: userId,
          status: 'RECORDING',
          started_at: new Date().toISOString(),
          created_by: userId,
          updated_by: userId,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      return (data as { id: string }).id
    },
    onSettled: invalidate,
  })

  const pause = useMutation<void, Error, { id: string; version: number }>({
    mutationFn: async ({ id, version }) => {
      if (!userId) throw new Error('로그인이 필요해요.')
      const r = await versionedUpdate('trip_sessions', id, version, { status: 'PAUSED', updated_by: userId })
      if (r.status === 'conflict') throw new ConflictError()
    },
    onSettled: invalidate,
  })

  const resume = useMutation<void, Error, { id: string; version: number }>({
    mutationFn: async ({ id, version }) => {
      if (!userId) throw new Error('로그인이 필요해요.')
      const r = await versionedUpdate('trip_sessions', id, version, { status: 'RECORDING', updated_by: userId })
      if (r.status === 'conflict') throw new ConflictError()
    },
    onSettled: invalidate,
  })

  const end = useMutation<void, Error, { id: string; version: number; recordedDistanceM?: number }>({
    mutationFn: async ({ id, version, recordedDistanceM }) => {
      if (!userId) throw new Error('로그인이 필요해요.')
      const r = await versionedUpdate('trip_sessions', id, version, {
        status: 'DONE',
        ended_at: new Date().toISOString(),
        recorded_distance_m: recordedDistanceM ?? null,
        updated_by: userId,
      })
      if (r.status === 'conflict') throw new ConflictError()
    },
    onSettled: invalidate,
  })

  return {
    start: start.mutateAsync,
    pause: pause.mutateAsync,
    resume: resume.mutateAsync,
    end: end.mutateAsync,
    isStarting: start.isPending,
  }
}
