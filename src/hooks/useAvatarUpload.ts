import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { cropAvatar, type CropTransform } from '@/lib/photos/avatar'

// 프로필 사진 올리기/지우기.
//
// 경로: `{couple_id}/avatars/{user_id}-{stamp}.{ext}`
//   - 첫 세그먼트가 couple_id여야 Storage 격리 정책을 통과한다(0022 — 행 RLS가 없어 경로로 막는다).
//   - stamp를 붙이는 이유: 같은 경로에 덮어쓰면 서명 URL 캐시(50분) 때문에 **바꿔도 옛 사진이
//     그대로 보인다**. 새 경로로 올리고 옛 파일을 지우면 그 문제가 원천적으로 없다.
//
// 오프라인 큐에 넣지 않는다 — usePhotos와 같은 이유(큐는 IndexedDB JSON이라 이미지가 들어가면 막힌다).
// 대신 실패하면 실패했다고 말한다.

const BUCKET = 'photos'

/** 아바타 Storage 경로. 커플 격리(첫 폴더=couple_id)를 지킨다. */
export function avatarPath(coupleId: string, userId: string, stamp: number, ext: string): string {
  return `${coupleId}/avatars/${userId}-${stamp}.${ext}`
}

export function useAvatarUpload(coupleId: string | null, userId: string | null) {
  const qc = useQueryClient()

  const invalidate = () => {
    if (userId) void qc.invalidateQueries({ queryKey: ['myProfile', userId] })
    if (coupleId) void qc.invalidateQueries({ queryKey: ['profiles', coupleId] })
  }

  /** 프로필 행에 새 경로를 쓴다. 0행 = 낙관적 락 충돌(다른 곳에서 먼저 바뀜). */
  const writeRow = async (path: string | null, expectedVersion: number) => {
    const { data, error } = await supabase
      .from('profiles')
      .update({ avatar_url: path, version: expectedVersion + 1 })
      .eq('id', userId!)
      .eq('version', expectedVersion)
      .select('id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
      throw new Error('프로필이 방금 다른 곳에서 바뀌었어요. 새로고침 후 다시 시도해 주세요.')
    }
  }

  /** 옛 파일 정리는 best-effort — 실패해도 사용자 흐름을 막지 않는다(고아 파일 1개 vs 에러 토스트). */
  const removeFile = async (path: string | null) => {
    if (!path) return
    try {
      await supabase.storage.from(BUCKET).remove([path])
    } catch {
      /* 무시 */
    }
  }

  const upload = useMutation<
    void,
    Error,
    { file: File; transform: CropTransform; expectedVersion: number; previousPath: string | null }
  >({
    mutationFn: async ({ file, transform, expectedVersion, previousPath }) => {
      if (!coupleId || !userId) throw new Error('먼저 상대와 연결해 주세요.')
      const { blob, ext } = await cropAvatar(file, transform)
      const path = avatarPath(coupleId, userId, Date.now(), ext)

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: blob.type, upsert: false })
      if (upErr) throw new Error(`사진을 올리지 못했어요: ${upErr.message}`)

      try {
        await writeRow(path, expectedVersion)
      } catch (e) {
        // 행을 못 썼으면 방금 올린 파일은 아무도 가리키지 않는다 — 고아로 남기지 않는다.
        await removeFile(path)
        throw e
      }
      await removeFile(previousPath)
    },
    onSettled: invalidate,
  })

  const remove = useMutation<void, Error, { expectedVersion: number; previousPath: string | null }>({
    mutationFn: async ({ expectedVersion, previousPath }) => {
      if (!userId) throw new Error('로그인이 필요해요.')
      // 행 먼저 비운다 — 파일부터 지우면 행이 깨진 경로를 가리키는 순간이 생긴다.
      await writeRow(null, expectedVersion)
      await removeFile(previousPath)
    },
    onSettled: invalidate,
  })

  return {
    upload: upload.mutateAsync,
    remove: remove.mutateAsync,
    isPending: upload.isPending || remove.isPending,
    error: upload.error ?? remove.error,
  }
}
