import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/state/auth'

type ProfilePatch = {
  display_name?: string
  color?: string
  /** Storage 경로. null이면 사진 지우기. */
  avatar_url?: string | null
  expectedVersion: number
}

// 내 프로필(이름·색·사진) 자가 수정 — profiles_self_update 허용. 낙관적 락: version 조건부 + version+1.
export function useUpdateProfile(coupleId: string | null) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const mutation = useMutation<void, Error, ProfilePatch>({
    mutationFn: async ({ display_name, color, avatar_url, expectedVersion }) => {
      if (!user) throw new Error('로그인이 필요해요.')
      const patch: Record<string, unknown> = { version: expectedVersion + 1 }
      if (display_name !== undefined) patch.display_name = display_name
      if (color !== undefined) patch.color = color
      if (avatar_url !== undefined) patch.avatar_url = avatar_url
      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', user.id)
        .eq('version', expectedVersion)
        .select('id')
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) throw new Error('프로필이 방금 다른 곳에서 바뀌었어요. 새로고침 후 다시 시도해 주세요.')
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['couple', user?.id] })
      if (user?.id) void qc.invalidateQueries({ queryKey: ['myProfile', user.id] })
      if (coupleId) void qc.invalidateQueries({ queryKey: ['profiles', coupleId] })
    },
  })
  return { updateProfile: mutation.mutateAsync, isPending: mutation.isPending, error: mutation.error }
}
