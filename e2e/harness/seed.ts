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

// self-host 웹폰트(Pretendard/Quicksand) 요청 차단 → e2e는 결정론적 폴백 폰트로 렌더한다.
// (웹폰트 비동기 로딩 타이밍이 스냅샷을 간헐 플래키하게 만들던 것 제거. 앱/프로덕션 폰트는 영향 없음.)
export async function blockFonts(page: Page): Promise<void> {
  await page.route(/\.(?:woff2?|ttf|otf)(?:\?.*)?$/i, (route) => route.abort())
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

  await blockFonts(page)
  await page.route(NAVER_SCRIPT_GLOB, (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: NAVER_STUB_JS }),
  )
  await page.route('**/e2e.supabase.co/auth/v1/token**', jsonRoute(session))
  await page.route('**/e2e.supabase.co/rest/v1/couples**', jsonRoute({
    id: 'c1', status: 'ACTIVE', user_a: USER_A, user_b: '00000000-0000-4000-8000-000000000a02', connected_at: '2020-01-01T00:00:00Z',
  }))
  // profiles: 동의 게이트는 제거됐다(연결=공유 기본값 §1). self 프로필 쿼리(useMyProfile)는
  //   이름·색·version을 담은 행으로 응답한다. 0014 동의 컬럼은 무해하게 잔존(채워둠).
  await page.route('**/e2e.supabase.co/rest/v1/profiles**', (route) => {
    const url = route.request().url()
    // 프로필 자가 수정(useUpdateProfile) — PATCH ... .select('id'). 낙관적 락이
    //   0행을 충돌로 보므로 영향 행(id)을 1개 돌려줘 저장이 통과하게 한다.
    if (route.request().method() === 'PATCH') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: USER_A }]),
      })
    }
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
