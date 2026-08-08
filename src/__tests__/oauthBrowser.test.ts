import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 시스템 브라우저를 그냥 닫았을 때 로그인 버튼이 '구글로 이동 중…'에 갇히던 버그의 회귀 테스트.
// 복귀 신호(딥링크)가 없는 경로라 실기에서만 드러났다 — 여기서 못박는다.

const state = vi.hoisted(() => ({
  finish: null as null | (() => void),
  removed: false,
  opened: [] as string[],
  session: null as unknown,
}))

vi.mock('@capacitor/browser', () => ({
  Browser: {
    addListener: vi.fn(async (_e: string, cb: () => void) => {
      state.finish = cb
      return {
        remove: async () => {
          state.removed = true
        },
      }
    }),
    open: vi.fn(async ({ url }: { url: string }) => {
      state.opened.push(url)
    }),
  },
}))

vi.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: state.session } }) } },
}))

import { openOAuthBrowser } from '@/lib/native/oauthBrowser'

beforeEach(() => {
  vi.useFakeTimers()
  state.finish = null
  state.removed = false
  state.opened = []
  state.session = null
})
afterEach(() => {
  vi.useRealTimers()
})

describe('openOAuthBrowser', () => {
  it('브라우저를 그냥 닫으면(세션 없음) 취소로 보고 되돌린다', async () => {
    const onCancelled = vi.fn()
    await openOAuthBrowser('https://accounts.google.com/x', onCancelled)
    expect(state.opened).toEqual(['https://accounts.google.com/x'])

    state.finish?.() // 사용자가 시트를 내림
    await vi.runAllTimersAsync()

    expect(onCancelled).toHaveBeenCalledTimes(1)
    expect(state.removed).toBe(true) // 리스너 정리(누수 금지)
  })

  it('성공해서 우리가 닫은 경우(세션 있음)엔 되돌리지 않는다', async () => {
    // browserFinished는 성공 경로에서도 뜬다 — 이벤트만 보면 성공을 취소로 오인한다.
    const onCancelled = vi.fn()
    await openOAuthBrowser('https://accounts.google.com/x', onCancelled)

    state.session = { user: { id: 'u1' } }
    state.finish?.()
    await vi.runAllTimersAsync()

    expect(onCancelled).not.toHaveBeenCalled()
  })

  it('닫힘이 여러 번 와도 한 번만 처리한다', async () => {
    const onCancelled = vi.fn()
    await openOAuthBrowser('https://accounts.google.com/x', onCancelled)

    state.finish?.()
    state.finish?.()
    await vi.runAllTimersAsync()

    expect(onCancelled).toHaveBeenCalledTimes(1)
  })
})
