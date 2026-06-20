import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { versionedUpdate, softDelete, ConflictError, PermissionError, refetchEventRow } from '@/lib/sync/versionedUpdate'
import { DISPLAY_TZ } from '@/lib/calendar/eventDays'
import { courseKey } from '@/lib/route/courseKey'
import type { CourseStop } from '@/lib/route/coursePlan'

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

export function useEventMutations(
  coupleId: string | null,
  myId: string | null,
  onConflict: () => void,
  onPermissionDenied?: () => void,
) {
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
      if (res.status === 'conflict') {
        const fresh = await refetchEventRow(id)
        if (fresh && fresh.visibility === 'PERSONAL' && fresh.owner_id !== myId) {
          throw new PermissionError() // 권한거부 — 메시지 분리(신규 클래스)
        }
        throw new ConflictError() // 진짜 버전충돌(기존 클래스 재사용)
      }
    },
    onError: (err) => {
      if (err instanceof PermissionError) onPermissionDenied?.()
      else if (err instanceof ConflictError) onConflict()
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

  // 추천 코스 → 일정 일괄 추가(§5.6 루프 닫기). itinerary(출처) 1건 생성 후 events를 단일 INSERT로
  // 한꺼번에(=원자적, 부분 생성 방지). 각 event에 itinerary_id(출처)·place_id(장소 연결) 보존.
  // 멱등(R1.1): 결정론 course_key로 upsert(중복 itinerary 안 만듦) + 이미 이벤트 있으면 재삽입 안 함.
  const addCourse = useMutation<
    { status: 'created' | 'exists'; itineraryId: string },
    Error,
    { stops: CourseStop[]; dayKeyStr: string; startMin: number }
  >({
    mutationFn: async ({ stops, dayKeyStr, startMin }) => {
      if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
      if (stops.length === 0) throw new Error('코스가 비어 있어요.')
      const key = courseKey(coupleId, dayKeyStr, stops.map((s) => s.placeId), startMin)
      // 멱등: 같은 course_key면 기존 itinerary 재사용(중복 생성 안 함).
      const { data: itin, error: itErr } = await supabase
        .from('itineraries')
        .upsert(
          {
            couple_id: coupleId,
            course_key: key,
            days: stops.map((s) => ({ placeId: s.placeId, start: s.start, end: s.end })),
            created_by: myId,
            updated_by: myId,
          },
          { onConflict: 'couple_id,course_key', ignoreDuplicates: false },
        )
        .select('id')
        .single()
      if (itErr || !itin) throw new Error(itErr?.message ?? '코스 저장에 실패했어요.')

      // 이 itinerary에 이미 이벤트가 있으면(동시/재시도) 재삽입하지 않는다.
      const { data: existing, error: exErr } = await supabase
        .from('events')
        .select('id')
        .eq('itinerary_id', itin.id)
        .is('deleted_at', null)
        .limit(1)
      if (exErr) throw new Error(exErr.message)
      if (existing && existing.length > 0) return { status: 'exists', itineraryId: itin.id }

      const rows = stops.map((s) => ({
        couple_id: coupleId,
        title: s.title,
        start: s.start,
        end: s.end,
        is_all_day: false,
        time_zone: DISPLAY_TZ,
        visibility: 'SHARED' as const,
        participants: 'BOTH' as const,
        owner_id: myId,
        place_id: s.placeId,
        itinerary_id: itin.id,
        created_by: myId,
        updated_by: myId,
      }))
      const { error: evErr } = await supabase.from('events').insert(rows)
      if (evErr) throw new Error(evErr.message)
      return { status: 'created', itineraryId: itin.id }
    },
    onSuccess: invalidate,
  })

  return { create, update, remove, addCourse }
}
