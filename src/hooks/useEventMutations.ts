import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { versionedUpdate, softDelete, ConflictError } from '@/lib/sync/versionedUpdate'

// 이벤트 생성/수정/삭제. 수정·삭제는 낙관적 락(version 조건부, §4.3) — 충돌이면 onConflict.
// 삭제는 soft-delete(휴지통, 물리삭제 아님). owner_id=본인(events_insert RLS WITH CHECK).
// 참고: 오프라인 큐 연동(D2)은 후속 — 현재 이벤트 쓰기는 온라인 경로.

export type Reminder = { userId: string; offsetMinutes: number }

export type NewEvent = {
  title: string
  start: string // ISO
  end: string // ISO
  isAllDay: boolean
  timeZone: string
  visibility: 'SHARED' | 'PERSONAL'
  placeId?: string | null
  memo?: string | null
  recurrenceRule?: string | null
  reminders?: Reminder[]
}

export type EventPatch = Partial<{
  title: string
  start: string
  end: string
  is_all_day: boolean
  visibility: 'SHARED' | 'PERSONAL'
  place_id: string | null
  memo: string | null
  recurrence_rule: string | null
  reminders: Reminder[]
}>

export function useEventMutations(coupleId: string | null, myId: string | null, onConflict: () => void) {
  const queryClient = useQueryClient()
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['events', coupleId] })

  const create = useMutation<void, Error, NewEvent>({
    mutationFn: async (e) => {
      if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
      const { error } = await supabase.from('events').insert({
        couple_id: coupleId,
        title: e.title,
        start: e.start,
        end: e.end,
        is_all_day: e.isAllDay,
        time_zone: e.timeZone,
        visibility: e.visibility,
        participants: 'BOTH',
        owner_id: myId,
        place_id: e.placeId ?? null,
        memo: e.memo ?? null,
        recurrence_rule: e.recurrenceRule ?? null,
        reminders: e.reminders ?? [],
        created_by: myId,
        updated_by: myId,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  const update = useMutation<void, Error, { id: string; expectedVersion: number; patch: EventPatch }>({
    mutationFn: async ({ id, expectedVersion, patch }) => {
      if (!myId) throw new Error('로그인이 필요해요.')
      const res = await versionedUpdate('events', id, expectedVersion, { ...patch, updated_by: myId })
      if (res.status === 'conflict') throw new ConflictError()
    },
    onError: (err) => {
      if (err instanceof ConflictError) onConflict()
    },
    onSettled: invalidate,
  })

  const remove = useMutation<void, Error, { id: string; expectedVersion: number }>({
    mutationFn: async ({ id, expectedVersion }) => {
      if (!myId) throw new Error('로그인이 필요해요.')
      const res = await softDelete('events', id, expectedVersion, myId)
      if (res.status === 'conflict') throw new ConflictError()
    },
    onError: (err) => {
      if (err instanceof ConflictError) onConflict()
    },
    onSettled: invalidate,
  })

  return { create, update, remove }
}
