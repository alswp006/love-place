import { useEffect, useId, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { resizePhoto } from '@/lib/photos/resize'

// 사진(§5.4) — 비공개 Storage + 서명 URL. 공개 버킷을 쓰지 않는 이유는 0022 주석 참조.
//
// 경로 규약: `{couple_id}/{uuid}.webp`, 썸네일은 `{couple_id}/{uuid}_t.webp`.
// 첫 폴더가 couple_id라서 Storage 정책이 그것만으로 격리한다.

export type PhotoRow = {
  id: string
  storage_url: string
  thumbnail_url: string | null
  place_id: string | null
  trip_id: string | null
  taken_at: string | null
  caption: string | null
  uploaded_by: string
  version: number
}

export function usePhotos(coupleId: string | null) {
  const queryClient = useQueryClient()
  const channelKey = useId()

  const query = useQuery<PhotoRow[]>({
    queryKey: ['photos', coupleId],
    enabled: Boolean(coupleId && isSupabaseConfigured),
    queryFn: async () => {
      if (!coupleId) return []
      const { data, error } = await supabase
        .from('photos')
        .select(
          'id, storage_url, thumbnail_url, place_id, trip_id, taken_at, caption, uploaded_by, version',
        )
        .eq('couple_id', coupleId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as PhotoRow[]
    },
  })

  useEffect(() => {
    if (!coupleId || !isSupabaseConfigured) return
    const ch = supabase
      .channel(`photos:${coupleId}:${channelKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'photos', filter: `couple_id=eq.${coupleId}` },
        () => queryClient.invalidateQueries({ queryKey: ['photos', coupleId] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [coupleId, queryClient, channelKey])

  return query
}

/** 장소별로 묶어 둔다 — 목록이 사진 하나 그릴 때마다 전체를 훑지 않게. */
export function usePhotosByPlace(coupleId: string | null) {
  const { data } = usePhotos(coupleId)
  return useMemo(() => {
    const m = new Map<string, PhotoRow[]>()
    for (const p of data ?? []) {
      if (!p.place_id) continue
      const list = m.get(p.place_id)
      if (list) list.push(p)
      else m.set(p.place_id, [p])
    }
    return m
  }, [data])
}

/**
 * 비공개 파일을 볼 수 있는 서명 URL. 만료되므로 캐시 수명을 만료보다 짧게 둔다.
 * 한 장씩 부르면 목록에서 수십 번 왕복하므로 한 번에 묶어 받는다.
 */
export function useSignedPhotoUrls(coupleId: string | null, paths: readonly string[]) {
  const key = [...paths].sort().join('|')
  return useQuery<Record<string, string>>({
    queryKey: ['photo-urls', coupleId, key],
    enabled: Boolean(coupleId && isSupabaseConfigured && paths.length > 0),
    // 서명 1시간, 캐시 50분 — 화면에 붙어 있는 동안 만료돼 깨지는 것을 막는다.
    staleTime: 50 * 60 * 1000,
    gcTime: 50 * 60 * 1000,
    queryFn: async () => {
      const unique = Array.from(new Set(paths))
      if (unique.length === 0) return {}
      const { data, error } = await supabase.storage
        .from('photos')
        .createSignedUrls(unique, 60 * 60)
      if (error) throw new Error(error.message)
      const map: Record<string, string> = {}
      for (const row of data ?? []) {
        if (row.path && row.signedUrl) map[row.path] = row.signedUrl
      }
      return map
    },
  })
}

/**
 * 업로드 — 리사이즈 → Storage 2개(표시본·썸네일) → photos 행.
 *
 * 오프라인 큐에 넣지 않는다: 큐는 IndexedDB에 JSON을 담는 구조라 수 MB 이미지를 넣으면
 * 저장소를 금세 채우고 flush가 통째로 막힌다. 사진은 연결됐을 때만 올리고, 안 되면 그렇게 말한다.
 */
export function useUploadPhoto(coupleId: string | null, myId: string | null) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { file: File; placeId?: string | null; tripId?: string | null }>({
    mutationFn: async ({ file, placeId, tripId }) => {
      if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('사진은 연결됐을 때 올릴 수 있어요.')
      }
      const { display, thumb } = await resizePhoto(file)
      const id = crypto.randomUUID()
      const path = `${coupleId}/${id}.webp`
      const thumbPath = `${coupleId}/${id}_t.webp`

      const up = await supabase.storage
        .from('photos')
        .upload(path, display, { contentType: display.type, upsert: false })
      if (up.error) throw new Error(up.error.message)

      const upT = await supabase.storage
        .from('photos')
        .upload(thumbPath, thumb, { contentType: thumb.type, upsert: false })
      if (upT.error) {
        // 썸네일만 실패하면 목록이 빈 채로 남는다 — 표시본을 되돌려 반쪽 상태를 안 만든다.
        await supabase.storage.from('photos').remove([path])
        throw new Error(upT.error.message)
      }

      const { error } = await supabase.from('photos').insert({
        id,
        couple_id: coupleId,
        storage_url: path,
        thumbnail_url: thumbPath,
        place_id: placeId ?? null,
        trip_id: tripId ?? null,
        // EXIF 촬영 시각·좌표는 다음 조각(자동 분류)에서. 지금은 수동 연결만.
        classified_by: placeId || tripId ? 'MANUAL' : 'UNCLASSIFIED',
        uploaded_by: myId,
        created_by: myId,
        updated_by: myId,
      })
      if (error) {
        // 행을 못 만들면 파일만 떠도는 고아가 된다 — 같이 치운다.
        await supabase.storage.from('photos').remove([path, thumbPath])
        throw new Error(error.message)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['photos', coupleId] })
    },
  })
}
