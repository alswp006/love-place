import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock 팩토리는 파일 상단으로 호이스트되므로 참조 변수도 vi.hoisted로 끌어올린다.
const { exchange } = vi.hoisted(() => ({
  exchange: vi.fn(async () => ({ data: {}, error: null })),
}))
vi.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { exchangeCodeForSession: exchange } },
}))
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }))

import { exchangeFromUrl } from '@/lib/native/authDeepLink'

describe('exchangeFromUrl — 딥링크 코드→세션', () => {
  beforeEach(() => exchange.mockClear())

  it('?code=가 있으면 exchangeCodeForSession(code) 호출 후 true', async () => {
    const ok = await exchangeFromUrl('app.loveplace://auth/callback?code=ABC123')
    expect(exchange).toHaveBeenCalledWith('ABC123')
    expect(ok).toBe(true)
  })

  it('code가 없으면 교환하지 않고 false', async () => {
    const ok = await exchangeFromUrl('app.loveplace://auth/callback')
    expect(exchange).not.toHaveBeenCalled()
    expect(ok).toBe(false)
  })

  it('잘못된 URL은 throw하지 않고 false', async () => {
    const ok = await exchangeFromUrl('not a url')
    expect(ok).toBe(false)
  })
})
