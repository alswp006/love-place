import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { useAuth } from '@/state/auth'
import type { GcalCalendar, GcalConnection, GcalEvent } from '@/lib/gcal/types'

// 모든 구글 캘린더 접근은 gcal-proxy 경유(키·토큰 서버 전용). action 으로 분기.
async function callGcal<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('gcal-proxy', {
    body: { action, ...payload },
  })
  if (error) {
    let msg = '구글 캘린더 요청에 실패했어요. 다시 시도해 주세요.'
    const ctxRes = (error as { context?: Response }).context
    if (ctxRes && typeof ctxRes.json === 'function') {
      try {
        const b = (await ctxRes.json()) as { message?: string }
        if (b.message) msg = b.message
      } catch {
        /* 본문 파싱 실패는 무시하고 기본 메시지 */
      }
    }
    throw new Error(msg)
  }
  const ok = (data as { ok?: boolean } | null)?.ok
  if (!data || ok === false) {
    throw new Error((data as { message?: string } | null)?.message ?? '구글 캘린더 요청에 실패했어요.')
  }
  return data as T
}

// 커플 양쪽의 연결 상태(둘 다 보기).
export function useGcalStatus() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['gcal', 'status', user?.id],
    enabled: Boolean(user) && isSupabaseConfigured,
    staleTime: 30_000,
    queryFn: () => callGcal<{ ok: true; connections: GcalConnection[] }>('status'),
    select: (d) => d.connections,
  })
}

// 내 구글 캘린더 목록(선택 화면에서만 enabled).
export function useGcalCalendars(enabled: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['gcal', 'calendars', user?.id],
    enabled: Boolean(user) && isSupabaseConfigured && enabled,
    staleTime: 60_000,
    queryFn: () =>
      callGcal<{ ok: true; connected: boolean; calendars: GcalCalendar[] }>('list_calendars'),
  })
}

// 기간 내 구글 일정(읽기전용 오버레이). range 가 null 이면 비활성.
export function useGcalEvents(range: { timeMin: string; timeMax: string } | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['gcal', 'events', user?.id, range?.timeMin, range?.timeMax],
    enabled: Boolean(user) && isSupabaseConfigured && range !== null,
    staleTime: 60_000,
    queryFn: () =>
      callGcal<{ ok: true; events: GcalEvent[]; degraded: boolean }>('list_events', {
        timeMin: range?.timeMin,
        timeMax: range?.timeMax,
      }),
  })
}

// 표시할 캘린더 1개 선택.
export function useSetGcalCalendar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { googleCalendarId: string; summary: string; color?: string }) =>
      callGcal('set_calendar', v),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['gcal'] }),
  })
}

// 내 연결 해제.
export function useDisconnectGcal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => callGcal('disconnect'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['gcal'] }),
  })
}

// 연동 시작 — 구글 OAuth(calendar.readonly + offline)로 재인증. 콜백(AuthCallbackPage)에서
// provider_refresh_token 을 캡처해 gcal-proxy(connect)로 저장한다.
export function startGoogleCalendarConnect() {
  sessionStorage.setItem('gcal_connect_pending', '1')
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      scopes: 'https://www.googleapis.com/auth/calendar.readonly',
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  })
}
