import { useEffect, useId } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'

// 일정 카테고리(투두메이트식 색+이름 목록, 0020). 둘이 함께 만들어 쓰는 공유 분류다.
// 장소의 places.category(검색 API가 준 문자열)와는 다른 축 — 섞지 말 것.
// 키 ['event_categories', coupleId]. RLS가 커플 격리, realtime이 양측 전파.
// 색만으로 구분하지 않는다(§8) — 소비하는 UI는 항상 색 + 이름 텍스트를 함께 낸다.

export type EventCategoryRow = {
  id: string
  name: string
  color: string
  sort_order: number
  version: number
}

/** 고를 수 있는 기본 색 — 마시멜로 팔레트 계열. 사용자가 값을 고르므로 토큰이 아니라 리터럴로 저장한다. */
export const CATEGORY_COLORS = [
  '#e2638a', // 핑크(브랜드)
  '#e0a33a', // 옐로
  '#4fb58a', // 민트
  '#6e8ac8', // 블루
  '#8b6ec8', // 라벤더
  '#c86b6b', // 코럴
] as const

export function useEventCategories(coupleId: string | null) {
  const queryClient = useQueryClient()
  // 채널 토픽은 훅 인스턴스마다 달라야 한다. 이 훅은 한 화면에서 두 번 이상 쓰인다
  // (CalendarPage의 칩 조회맵 + EventSheet의 CategoryPicker). 토픽이 같으면 supabase-js가
  // 이미 subscribe()된 채널을 재사용해 `.on()`이 던진다:
  //   "cannot add `postgres_changes` callbacks ... after `subscribe()`"
  // → 캘린더 화면 전체가 에러 폴백으로 떨어졌다(⋯를 열 때마다 재현).
  const channelKey = useId()

  const query = useQuery<EventCategoryRow[]>({
    queryKey: ['event_categories', coupleId],
    enabled: Boolean(coupleId && isSupabaseConfigured),
    queryFn: async () => {
      if (!coupleId) return []
      const { data, error } = await supabase
        .from('event_categories')
        .select('id, name, color, sort_order, version')
        .eq('couple_id', coupleId)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }) // sort_order 동률에서 순서가 흔들리지 않게
      if (error) throw new Error(error.message)
      return (data ?? []) as EventCategoryRow[]
    },
  })

  // 상대가 만든 카테고리가 바로 뜨게(web-stack §4.3). cleanup으로 채널 누수 방지.
  useEffect(() => {
    if (!coupleId || !isSupabaseConfigured) return
    const channel = supabase
      .channel(`event_categories:${coupleId}:${channelKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_categories',
          filter: `couple_id=eq.${coupleId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ['event_categories', coupleId] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, queryClient, channelKey])

  return query
}

export function useEventCategoryMutations(coupleId: string | null, myId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['event_categories', coupleId] })

  /** 새 카테고리. 같은 이름이 살아있으면 부분 유니크 인덱스가 막는다(23505) → 친화 문구로 바꿔 던진다. */
  const create = useMutation<EventCategoryRow, Error, { name: string; color: string }>({
    mutationFn: async ({ name, color }) => {
      if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
      const trimmed = name.trim()
      if (!trimmed) throw new Error('카테고리 이름을 적어주세요.')
      const { data, error } = await supabase
        .from('event_categories')
        .insert({
          couple_id: coupleId,
          name: trimmed,
          color,
          created_by: myId,
          updated_by: myId,
        })
        .select('id, name, color, sort_order, version')
        .single()
      if (error) {
        if (error.code === '23505') throw new Error('같은 이름의 카테고리가 이미 있어요.')
        throw new Error(error.message)
      }
      return data as EventCategoryRow
    },
    onSuccess: invalidate,
  })

  return { create }
}
