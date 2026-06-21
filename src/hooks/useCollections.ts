import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { versionedUpdate, softDelete } from '@/lib/sync/versionedUpdate'

// 사용자 정의 컬렉션(저장 목록) — 네이버지도 "내가 만든 리스트"류. 가산 데이터 레이어.
// 내장 도출 상태(가고싶음=wishes / 가본=visits)는 그대로 도출로 둔다(CLAUDE.md §7) — 여기서 건드리지 않음.
// 컬렉션은 사용자가 직접 만드는 명명 목록 + 장소-목록 다대다 조인(place_collections). 상태 플래그 아님.
// 키 ['collections', coupleId] / ['place_collections', coupleId]. RLS가 커플 격리, realtime이 양측 전파.
// 변경(rename/delete/removePlace)은 낙관적 락(version 조건부) — 0행 = 충돌 → onConflict(LWW 금지 §4.3).

export type CollectionRow = {
  id: string
  name: string
  version: number
}

export type PlaceCollectionRow = {
  id: string
  collection_id: string
  place_id: string
  version: number
}

// ─────────────────────────────────────────────────────────────
// 조회
// ─────────────────────────────────────────────────────────────

/** 살아있는 컬렉션 목록(생성순). UI가 목록 칩/필터를 그린다. */
export function useCollections(coupleId: string | null) {
  return useQuery<CollectionRow[]>({
    queryKey: ['collections', coupleId],
    enabled: Boolean(coupleId && isSupabaseConfigured),
    queryFn: async () => {
      if (!coupleId) return []
      const { data, error } = await supabase
        .from('collections')
        .select('id, name, version')
        .eq('couple_id', coupleId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as CollectionRow[]
    },
  })
}

/** 커플의 살아있는 장소-목록 조인행. UI가 place별 소속(membership)을 도출하거나 목록별 필터링한다. */
export function usePlaceCollections(coupleId: string | null) {
  return useQuery<PlaceCollectionRow[]>({
    queryKey: ['place_collections', coupleId],
    enabled: Boolean(coupleId && isSupabaseConfigured),
    queryFn: async () => {
      if (!coupleId) return []
      const { data, error } = await supabase
        .from('place_collections')
        .select('id, collection_id, place_id, version')
        .eq('couple_id', coupleId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as PlaceCollectionRow[]
    },
  })
}

// ─────────────────────────────────────────────────────────────
// 변경(mutations) — useVisits/useReactions 패턴(versionedUpdate/softDelete, onConflict 플래그)
// ─────────────────────────────────────────────────────────────

/** 컬렉션 생성(insert). 같은 이름은 부분 유니크 인덱스가 막는다(uq_collections_couple_name). */
export function useCreateCollection(coupleId: string | null, myId: string | null) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { name: string }>({
    mutationFn: async ({ name }) => {
      if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
      const { error } = await supabase.from('collections').insert({
        couple_id: coupleId,
        name,
        created_by: myId,
        updated_by: myId,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collections', coupleId] })
    },
  })
}

/** 컬렉션 이름 변경 — 낙관적 락(version 조건부). 0행 = 충돌 → onConflict(무음 덮어쓰기 금지). */
export function useRenameCollection(
  coupleId: string | null,
  myId: string | null,
  onConflict: () => void,
) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { id: string; version: number; name: string }>({
    mutationFn: async ({ id, version, name }) => {
      if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
      const res = await versionedUpdate('collections', id, version, { name, updated_by: myId })
      if (res.status === 'conflict') onConflict()
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collections', coupleId] })
    },
  })
}

/** 컬렉션 삭제(soft-delete, deleted_at) — 낙관적 락. 조인행(place_collections)은 그대로 두되 RLS·조회가 함께 가린다. */
export function useDeleteCollection(
  coupleId: string | null,
  myId: string | null,
  onConflict: () => void,
) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { id: string; version: number }>({
    mutationFn: async ({ id, version }) => {
      if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
      const res = await softDelete('collections', id, version, myId)
      if (res.status === 'conflict') onConflict()
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collections', coupleId] })
    },
  })
}

/**
 * 장소를 컬렉션에 추가(조인 insert). 더블탭/재시도 안전을 위해 unique-violation(23505)은 멱등 no-op으로 삼킨다
 * (이미 들어있으면 성공으로 본다 — uq_place_collections_pair).
 */
export function useAddPlaceToCollection(coupleId: string | null, myId: string | null) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { placeId: string; collectionId: string }>({
    mutationFn: async ({ placeId, collectionId }) => {
      if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
      const { error } = await supabase.from('place_collections').insert({
        couple_id: coupleId,
        collection_id: collectionId,
        place_id: placeId,
        created_by: myId,
        updated_by: myId,
      })
      // 23505 = unique_violation → 이미 소속됨. 멱등 no-op(에러로 올리지 않음).
      if (error && error.code !== '23505') throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['place_collections', coupleId] })
    },
  })
}

/**
 * 장소를 컬렉션에서 제거 — 살아있는 조인행을 직접 재조회(stale-cache race 회피, useReactions 패턴) 후 soft-delete.
 * 낙관적 락(version 조건부): 0행 = 충돌 → onConflict. 살아있는 조인행이 없으면 no-op.
 */
export function useRemovePlaceFromCollection(
  coupleId: string | null,
  myId: string | null,
  onConflict: () => void,
) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { placeId: string; collectionId: string }>({
    mutationFn: async ({ placeId, collectionId }) => {
      if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
      const { data: live, error: selErr } = await supabase
        .from('place_collections')
        .select('id, version')
        .eq('couple_id', coupleId)
        .eq('collection_id', collectionId)
        .eq('place_id', placeId)
        .is('deleted_at', null)
        .limit(1)
      if (selErr) throw new Error(selErr.message)
      const existing = (live ?? [])[0] as { id: string; version: number } | undefined
      if (!existing) return // 이미 빠져있음 — no-op
      const res = await softDelete('place_collections', existing.id, existing.version, myId)
      if (res.status === 'conflict') onConflict()
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['place_collections', coupleId] })
    },
  })
}
