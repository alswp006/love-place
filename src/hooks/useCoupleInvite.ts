import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/state/auth'
import { normalizeInviteCode } from '@/lib/inviteCode'

// RPC 응답: jsonb라 data로 도착(검증 실패는 throw 아님). data.ok로 분기.
export type InviteResult = { ok: true; code: string; expires_at: string } | { ok: false; reason: string }
export type AcceptResult =
  | { ok: true; couple_id: string; status: 'ACTIVE' }
  | { ok: false; reason: string }
export type DisconnectResult = { ok: boolean; reason?: string }

// 거부 사유 → 사용자 친화 한국어(P0d 명세 §5).
export function inviteReasonMessage(reason: string): string {
  const m: Record<string, string> = {
    AUTH_REQUIRED: '로그인이 필요해요.',
    INVALID_CODE: '유효하지 않은 코드예요. 코드를 다시 확인하거나 새 코드를 받아 주세요.',
    EXPIRED: '초대 코드가 만료됐어요(유효 48시간). 상대에게 새 코드를 받아 주세요.',
    SELF_INVITE: '본인이 만든 코드예요. 이 코드를 상대에게 전달해 주세요.',
    ALREADY_COUPLED: '이미 연결된 상대가 있어요. 새로 연결하려면 [우리]에서 먼저 연결을 해제해 주세요.',
    PARTNER_TAKEN: '상대가 방금 다른 분과 연결됐어요. 새 코드를 받아 주세요.',
    NOT_MEMBER_OR_NOT_ACTIVE: '연결을 해제할 수 없어요. 이미 해제됐거나 권한이 없어요.',
  }
  return m[reason] ?? '일시적인 오류예요. 잠시 후 다시 시도해 주세요.'
}

export function useCreateInvite() {
  return useMutation<InviteResult, Error, void>({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_invite')
      if (error) throw new Error(error.message)
      return data as InviteResult
    },
  })
}

export function useAcceptInvite() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation<AcceptResult, Error, string>({
    mutationFn: async (rawCode) => {
      const { data, error } = await supabase.rpc('accept_invite', {
        p_code: normalizeInviteCode(rawCode),
      })
      if (error) throw new Error(error.message)
      return data as AcceptResult
    },
    onSuccess: (res) => {
      if (res.ok) qc.invalidateQueries({ queryKey: ['couple', user?.id] })
    },
  })
}

export function useDisconnectCouple() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation<DisconnectResult, Error, string>({
    mutationFn: async (coupleId) => {
      const { data, error } = await supabase.rpc('disconnect_couple', { p_couple_id: coupleId })
      if (error) throw new Error(error.message)
      return data as DisconnectResult
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['couple', user?.id] })
      qc.clear() // 타 couple 데이터 잔존 방지(web-stack §4.2)
    },
  })
}
