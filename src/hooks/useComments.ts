import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { softDelete } from '@/lib/sync/versionedUpdate'

// 일정 댓글(0018) — 스레드 없는 평면 목록. 대댓글·멘션·알림 없음(ux §2 '무거운 소셜 금지'의 취지 유지).
// 읽기는 커플 전체(상대 댓글도 봐야 대화가 된다), 쓰기는 본인 명의만 — RLS가 강제한다.
export type CommentRow = {
  id: string
  event_id: string
  body: string
  author_id: string
  created_at: string
  version: number
}

/** 본문 제약(0018 CHECK와 동일) — 클라에서 먼저 걸러 왕복을 아낀다. */
export const COMMENT_MAX_LEN = 500

let commentsChannelSeq = 0 // 토픽 유일화(같은 토픽 재구독 시 throw 회피 — useTrips와 동일 사유)

export function useComments(coupleId: string | null, eventId: string | null) {
  const queryClient = useQueryClient()

  const query = useQuery<CommentRow[]>({
    queryKey: ['comments', coupleId, eventId],
    enabled: Boolean(coupleId && eventId && isSupabaseConfigured),
    queryFn: async () => {
      if (!coupleId || !eventId) return []
      const { data, error } = await supabase
        .from('comments')
        .select('id, event_id, body, author_id, created_at, version')
        .eq('couple_id', coupleId)
        .eq('event_id', eventId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as CommentRow[]
    },
  })

  // 상대가 남긴 댓글이 바로 뜨게(§5.1). 페이로드를 직접 머지하지 않고 무효화로 일원화(web-stack §4.3).
  useEffect(() => {
    if (!coupleId || !eventId || !isSupabaseConfigured) return
    const channel = supabase
      .channel(`comments:${eventId}:${++commentsChannelSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `event_id=eq.${eventId}` },
        () => queryClient.invalidateQueries({ queryKey: ['comments', coupleId, eventId] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, eventId, queryClient])

  return query
}

export function useAddComment(coupleId: string | null, myId: string | null, eventId: string | null) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { body: string }>({
    mutationFn: async ({ body }) => {
      if (!coupleId || !myId || !eventId) throw new Error('먼저 상대와 연결해 주세요.')
      const text = body.trim()
      if (!text) throw new Error('내용을 입력해 주세요.')
      if (text.length > COMMENT_MAX_LEN) throw new Error(`${COMMENT_MAX_LEN}자까지 쓸 수 있어요.`)
      const { error } = await supabase.from('comments').insert({
        couple_id: coupleId,
        event_id: eventId,
        body: text,
        author_id: myId,
        created_by: myId,
        updated_by: myId,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['comments', coupleId, eventId] }),
  })
}

/**
 * 댓글 삭제 — soft-delete(§4.3). version 조건부라 0행이면 충돌로 표시한다(LWW 금지).
 * RLS(comments_update)가 작성자 본인으로 제한하므로 상대 댓글은 애초에 지워지지 않는다.
 */
export function useDeleteComment(
  coupleId: string | null,
  myId: string | null,
  eventId: string | null,
  onConflict: () => void,
) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { id: string; expectedVersion: number }>({
    mutationFn: async ({ id, expectedVersion }) => {
      if (!myId) throw new Error('로그인이 필요해요.')
      const res = await softDelete('comments', id, expectedVersion, myId)
      if (res.status === 'conflict') onConflict()
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['comments', coupleId, eventId] }),
  })
}
