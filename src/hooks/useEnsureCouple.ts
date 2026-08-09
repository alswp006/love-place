import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { useAuth } from '@/state/auth'

// 로그인했는데 ACTIVE 커플이 없으면 '혼자짜리 커플'을 만들어 준다(0024 ensure_solo_couple).
//
// 왜 필요한가: current_couple_id()는 ACTIVE만 인정하므로, 커플 행이 없으면 RLS가 전부 막는다.
// 예전엔 그래서 연결 화면 말고는 보여줄 게 없었다. 이제 혼자서도 바로 쓰기 시작할 수 있다.
//
// 신규 가입은 트리거(handle_new_user)가 이미 깔아 주고, 기존 계정은 0024 백필이 처리했다.
// 이 훅은 **그 둘이 모두 빗나간 경우의 마지막 방어선**이다(트리거 실패·수동 생성 계정 등).
// 그래서 조건이 맞을 때 한 번만 부르고, 실패하면 조용히 물러난다 — 호출부가 연결 화면으로 보낸다.

type EnsureState = 'idle' | 'running' | 'done' | 'failed'

export function useEnsureCouple(opts: { needed: boolean }): { state: EnsureState } {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [state, setState] = useState<EnsureState>('idle')
  // 사용자당 한 번만 — 실패해도 다시 두드리지 않는다(무한 루프 방지).
  const triedFor = useRef<string | null>(null)

  const needed = opts.needed
  useEffect(() => {
    if (!needed || !user || !isSupabaseConfigured) return
    if (triedFor.current === user.id) return
    triedFor.current = user.id
    setState('running')
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('ensure_solo_couple')
        const ok = !error && (data as { ok?: boolean } | null)?.ok === true
        if (!ok) {
          setState('failed')
          return
        }
        await queryClient.invalidateQueries({ queryKey: ['couple', user.id] })
        setState('done')
      } catch {
        setState('failed')
      }
    })()
  }, [needed, user, queryClient])

  return { state }
}
