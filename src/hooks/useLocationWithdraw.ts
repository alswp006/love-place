import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

// 동선 철회=하드 파기 — 즉시 기록 중지(네이티브 recorder) + location-purge Edge Function(service_role) 호출.
// 설계 §5[3](철회·중지 기술적 수단) §5[4](동선+동반 확인자료 파기). 동의(consent_log) 철회는 useConsent.withdraw가 담당.
export function useLocationWithdraw(coupleId: string | null) {
  const qc = useQueryClient()
  const mutation = useMutation<void, Error, { sessionId: string; stop?: () => Promise<void> | void }>({
    mutationFn: async ({ sessionId, stop }) => {
      // 1) 즉시 수집 중단(제24조2 — 거절 불가, 기술적 수단). recorder가 없으면(웹) no-op.
      if (stop) await stop()
      // 2) 서버 하드 파기(service_role) — 클라가 직접 못 하므로 Edge Function 경유.
      const { data, error } = await supabase.functions.invoke<{ ok: boolean }>('location-purge', {
        body: { sessionId },
      })
      if (error) throw new Error(error.message)
      if (!data || data.ok !== true) throw new Error('파기 처리에 실패했어요.')
    },
    onSettled: () => {
      // 하드파기 = 클라 캐시도 evict(복호된 좌표 잔존 금지). invalidate(데이터 유지·재조회)로는 부족.
      qc.removeQueries({ queryKey: ['recorded-route', coupleId] })
      qc.removeQueries({ queryKey: ['trip-recorded-session', coupleId] })
      void qc.invalidateQueries({ queryKey: ['trip-session', coupleId] })
    },
  })
  return { withdraw: mutation.mutateAsync, isPending: mutation.isPending, error: mutation.error }
}
