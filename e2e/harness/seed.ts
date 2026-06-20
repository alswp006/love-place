// e2e/harness/seed.ts — 세션 시드 + Supabase REST/auth + 네이버 스크립트 라우팅(dossier 04 §I).
import type { Page } from '@playwright/test'
import { NAVER_SCRIPT_GLOB, NAVER_STUB_JS } from './naverStub'

export const USER_A = '00000000-0000-4000-8000-000000000a01'
const FAR_FUTURE = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600

export type SeedTables = {
  places?: unknown[]
  wishes?: unknown[]
  visits?: unknown[]
  reactions?: unknown[]
  profiles?: unknown[]
  events?: unknown[]
}

function jsonRoute(body: unknown) {
  return (route: import('@playwright/test').Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
}

export async function seedAuthedMap(page: Page, tables: SeedTables = {}): Promise<void> {
  const session = {
    access_token: 'e2e', token_type: 'bearer', expires_in: 3600, expires_at: FAR_FUTURE,
    refresh_token: 'e2e',
    user: { id: USER_A, aud: 'authenticated', role: 'authenticated', email: 'me@e2e.test', app_metadata: {}, user_metadata: {}, created_at: '2020-01-01T00:00:00Z' },
  }
  await page.addInitScript(([key, val]) => {
    window.localStorage.setItem(key as string, val as string)
  }, ['sb-e2e-auth-token', JSON.stringify(session)])

  await page.route(NAVER_SCRIPT_GLOB, (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: NAVER_STUB_JS }),
  )
  await page.route('**/e2e.supabase.co/auth/v1/token**', jsonRoute(session))
  await page.route('**/e2e.supabase.co/rest/v1/couples**', jsonRoute({
    id: 'c1', status: 'ACTIVE', user_a: USER_A, user_b: '00000000-0000-4000-8000-000000000a02', connected_at: '2020-01-01T00:00:00Z',
  }))
  // profiles: 동의 가드(RequireAuth)가 보는 self 프로필 쿼리(consent select)는 "동의 완료" 행으로 응답해
  //   ACTIVE 시드 사용자가 /onboarding/steps로 튕기지 않게 한다. 그 외 profiles 쿼리는 시드값(기본 빈 배열).
  await page.route('**/e2e.supabase.co/rest/v1/profiles**', (route) => {
    const url = route.request().url()
    if (url.includes('consent_at')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: USER_A,
            display_name: '나',
            color: '#3b6db5',
            version: 1,
            location_consent_at: '2020-01-01T00:00:00Z',
            photo_consent_at: '2020-01-01T00:00:00Z',
          },
        ]),
      })
    }
    return jsonRoute(tables.profiles ?? [])(route)
  })
  await page.route('**/e2e.supabase.co/rest/v1/places**', jsonRoute(tables.places ?? []))
  await page.route('**/e2e.supabase.co/rest/v1/wishes**', jsonRoute(tables.wishes ?? []))
  await page.route('**/e2e.supabase.co/rest/v1/visits**', jsonRoute(tables.visits ?? []))
  await page.route('**/e2e.supabase.co/rest/v1/reactions**', jsonRoute(tables.reactions ?? []))
  // 캘린더(§5.1) — events REST. 미시드 시 빈 배열(연결됨-빈 CTA 경로). Realtime은 abort로 폴백.
  await page.route('**/e2e.supabase.co/rest/v1/events**', jsonRoute(tables.events ?? []))
  await page.route('**/realtime/v1/websocket**', (route) => route.abort())
}
