import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { ConsentType, ConsentScope, NotifyMode } from '@/lib/journey/types'

// R6 4종 동의 — consent_log(append-only) 정본. "현재 상태" = 타입별 최신 행(security-privacy §3.2, 설계 §4).
// 기본 OFF(다크패턴 금지). canRecord(수집·이용)는 세션 시작 게이트(설계 §5[2]).
// 위치정보처리방침 버전 — 약관 변경 시 올려서 재동의 유도.
export const LOCATION_POLICY_VERSION = '2026-06-27'

export type ConsentRow = {
  consent_type: ConsentType
  scope: ConsentScope | null
  granted: boolean
  notify_mode: NotifyMode | null
  created_at: string
}

/** desc(created_at) 행에서 타입별 최신 1건만 남긴다(현재 동의 상태). */
function latestByType(rows: ConsentRow[]): Map<ConsentType, ConsentRow> {
  const m = new Map<ConsentType, ConsentRow>()
  for (const r of rows) if (!m.has(r.consent_type)) m.set(r.consent_type, r)
  return m
}

export type GrantOpts = { scope?: ConsentScope; notifyMode?: NotifyMode; shownTextHash?: string }

export function useConsent(coupleId: string | null, userId: string | null) {
  const qc = useQueryClient()
  const query = useQuery<ConsentRow[]>({
    queryKey: ['consent', userId],
    enabled: Boolean(userId && isSupabaseConfigured),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('consent_log')
        .select('consent_type, scope, granted, notify_mode, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as ConsentRow[]
    },
  })

  const latest = useMemo(() => latestByType(query.data ?? []), [query.data])
  const isGranted = (t: ConsentType) => latest.get(t)?.granted === true
  const canRecord = isGranted('COLLECT_USE')
  const canProvide = isGranted('THIRD_PARTY_PROVIDE_PARTNER')
  const notifyMode: NotifyMode = latest.get('NOTIFY_METHOD')?.notify_mode ?? 'IMMEDIATE'

  const record = useMutation<
    void,
    Error,
    { type: ConsentType; granted: boolean; scope?: ConsentScope; notifyMode?: NotifyMode; shownTextHash?: string }
  >({
    mutationFn: async ({ type, granted, scope, notifyMode: nm, shownTextHash }) => {
      if (!userId) throw new Error('로그인이 필요해요.')
      const nowIso = new Date().toISOString()
      const { error } = await supabase.from('consent_log').insert({
        user_id: userId,
        couple_id: coupleId,
        consent_type: type,
        scope: scope ?? null,
        granted,
        notify_mode: nm ?? null,
        policy_version: LOCATION_POLICY_VERSION,
        shown_text_hash: shownTextHash ?? '',
        granted_at: granted ? nowIso : null,
        withdrawn_at: granted ? null : nowIso,
        created_by: userId,
      })
      if (error) throw new Error(error.message)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['consent', userId] })
    },
  })

  const grant = (type: ConsentType, opts: GrantOpts = {}) =>
    record.mutateAsync({ type, granted: true, ...opts })
  const withdraw = (type: ConsentType, opts: GrantOpts = {}) =>
    record.mutateAsync({ type, granted: false, ...opts })

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    canRecord,
    canProvide,
    notifyMode,
    grant,
    withdraw,
    isPending: record.isPending,
  }
}
