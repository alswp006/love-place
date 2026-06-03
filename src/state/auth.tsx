import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'

// 세션 단일 관리(web-stack.md §4.2) — onAuthStateChange 구독으로 로그인/로그아웃/토큰갱신을 한 곳에서.
type AuthState = {
  /** 초기 세션 복원이 끝났는지(이게 false면 깜빡임 방지용 로딩) */
  initializing: boolean
  session: Session | null
  user: User | null
  /** Supabase 키가 설정됐는지(미설정이면 로그인 화면이 안내) */
  configured: boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // 키 미설정 — 복원할 세션이 없으니 즉시 초기화 완료(로그인 화면이 "설정 필요" 안내).
      setInitializing(false)
      return
    }

    let active = true
    // 1) 저장된 세션 복원(매직링크 콜백이 URL에 있으면 detectSessionInUrl이 처리).
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setInitializing(false)
    })

    // 2) 이후 변화 구독(로그인/로그아웃/자동갱신).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      initializing,
      session,
      user: session?.user ?? null,
      configured: isSupabaseConfigured,
    }),
    [initializing, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth는 <AuthProvider> 안에서만 사용하세요.')
  return ctx
}
