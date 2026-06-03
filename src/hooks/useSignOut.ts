import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'

// 로그아웃 — 세션 종료 + TanStack Query 캐시 비움(타 couple 데이터 잔존 금지, web-stack.md §4.2).
export function useSignOut() {
  const queryClient = useQueryClient()
  return useCallback(async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut()
    }
    queryClient.clear()
  }, [queryClient])
}
