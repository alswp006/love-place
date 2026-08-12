import { test, expect } from '@playwright/test'
import { seedAuthedMap } from './harness/seed'

// 웹 동선 기록 — **진짜 브라우저에서** watchPosition으로 점이 실제로 올라가는지.
//
// 이 경로가 예전엔 통째로 거짓말이었다: 웹에는 네이티브 플러그인이 없어 recorder가 no-op이었는데
// UI는 '기록 중' 배지를 켜고 DB에는 RECORDING 세션이 생겼다. 여행이 끝나고서야 점 0개를 발견한다.
// jsdom에는 geolocation이 없어 단위 테스트로는 여기까지 못 온다(순수 로직만 webRecorder.test.ts).

const PLACE = {
  id: 'p1', name: '속초 칠성조선소', address: '강원 속초시', region_label: '속초',
  lat: 38.2, lng: 128.59, category: '카페', kakao_place_id: 'k1',
  added_by: '00000000-0000-4000-8000-000000000a01', version: 1,
}

test.use({
  permissions: ['geolocation'],
  geolocation: { latitude: 38.207, longitude: 128.5918 }, // 속초 칠성조선소
})

test('웹에서도 동선이 실제로 기록된다 — 시작 전·기록 중 모두 한계를 말한다', async ({
  page,
  context,
}) => {
  // record_points RPC를 가로채 **실제로 올라간 점**을 본다(UI 배지가 아니라 전송을 본다).
  const sent: { session: string; points: { lat: number; lng: number }[] }[] = []
  await page.route('**/e2e.supabase.co/rest/v1/rpc/record_points**', async (route) => {
    const body = route.request().postDataJSON() as { p_session: string; p_points: unknown[] }
    sent.push({
      session: body.p_session,
      points: (body.p_points as { lat: number; lng: number }[]) ?? [],
    })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body.p_points?.length ?? 0),
    })
  })

  await seedAuthedMap(page, { locationConsent: true, places: [PLACE] })
  await page.goto('/')

  // 2026-08: 고른 장소가 없으면 시트가 아예 없다 — 예전처럼 '덮고 있는 시트를 접는' 준비 동작이
  // 필요 없어졌다. 지도 준비 신호는 검색 오버레이다.
  await expect(page.getByTestId('search-overlay')).toBeVisible()
  await expect(page.getByRole('region', { name: '장소 시트' })).toHaveCount(0)

  // 시작 전에 한계를 말한다 — 누르고 나서 알면 이미 늦다.
  const start = page.getByRole('button', { name: /동선 시작/ })
  await expect(start).toBeVisible()
  await expect(page.getByText('화면을 켜 둔 동안만 기록돼요').first()).toBeVisible()

  await start.click()

  // 기록 중 배지에도 같은 한계가 붙어 있다(여행 중엔 시작 안내가 기억나지 않는다).
  const badge = page.getByRole('status', { name: '동선 기록 상태' })
  await expect(badge).toContainText('기록 중')
  await expect(badge).toContainText('화면을 켜 둔 동안만 기록돼요')

  // 실제로 움직인다 — distanceFilter(15m)를 넘도록 충분히.
  await context.setGeolocation({ latitude: 38.2075, longitude: 128.5918 }) // ~55m
  await context.setGeolocation({ latitude: 38.208, longitude: 128.5918 }) // ~55m 더

  // 종료하면 큐가 비워지며 점이 올라간다(종료 순서 불변식: stop → drain → 상태 변경).
  await page.getByRole('button', { name: /동선 기록 종료/ }).click()

  await expect
    .poll(() => sent.flatMap((s) => s.points).length, { timeout: 15_000 })
    .toBeGreaterThan(0)
  expect(sent[0]!.session).toBe('sess-1')
  const first = sent.flatMap((s) => s.points)[0]!
  expect(first.lat).toBeCloseTo(38.207, 2)
})
