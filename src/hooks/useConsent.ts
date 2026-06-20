import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { useAuth } from '@/state/auth'

// 위치/사진 상호 동의(security-privacy §3.2) — 동의=타임스탬프 존재. 둘 다 기록돼야 consentRecorded.
// 단일 진실원: consentRecorded는 이 위저드와 RequireAuth(가드)가 함께 참조한다.
export type ConsentState = {
  consentRecorded: boolean
  isLoading: boolean
  locationConsentAt: string | null
  photoConsentAt: string | null
  version: number | null
}

// 내 동의 시각 조회 — 가드는 enabled:active로 게이트(미연결 사용자에겐 불필요한 쿼리 방지).
export function useConsent(options?: { enabled?: boolean }): ConsentState {
  const { user } = useAuth()
  const enabled = (options?.enabled ?? true) && Boolean(user && isSupabaseConfigured)
  const query = useQuery<{
    location_consent_at: string | null
    photo_consent_at: string | null
    version: number
  } | null>({
    queryKey: ['consent', user?.id],
    enabled,
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('location_consent_at, photo_consent_at, version')
        .eq('id', user.id)
        .maybeSingle()
      if (error || !data) return null
      return data
    },
  })

  const loc = query.data?.location_consent_at ?? null
  const photo = query.data?.photo_consent_at ?? null
  return {
    // 로딩 전이거나 미기록이면 false로 취급(가드는 동의 완료를 명시적으로 확인해야 통과).
    consentRecorded: loc != null && photo != null,
    isLoading: enabled && query.isLoading,
    locationConsentAt: loc,
    photoConsentAt: photo,
    version: query.data?.version ?? null,
  }
}

type ConsentPatch = { expectedVersion: number }

// 동의 자가 기록 — profiles_self_update 허용. 낙관적 락: version 조건부 + version+1.
// onSettled에서 consent·couple 쿼리 무효화 → 가드가 즉시 재평가(동의 완료 인지).
export function useUpdateConsent() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const mutation = useMutation<void, Error, ConsentPatch>({
    mutationFn: async ({ expectedVersion }) => {
      if (!user) throw new Error('로그인이 필요해요.')
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('profiles')
        .update({ location_consent_at: now, photo_consent_at: now, version: expectedVersion + 1 })
        .eq('id', user.id)
        .eq('version', expectedVersion)
        .select('id')
      if (error) throw new Error(error.message)
      if (!data || data.length === 0)
        throw new Error('프로필이 방금 다른 곳에서 바뀌었어요. 새로고침 후 다시 시도해 주세요.')
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['consent', user?.id] })
      void qc.invalidateQueries({ queryKey: ['couple', user?.id] })
      void qc.invalidateQueries({ queryKey: ['myProfile', user?.id] })
    },
  })
  return { updateConsent: mutation.mutateAsync, isPending: mutation.isPending, error: mutation.error }
}
