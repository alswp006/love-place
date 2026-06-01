import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// 비주얼/기능 스모크 — 5탭 셸이 모바일 뷰포트에서 렌더되고 탭 네비게이션이 동작하는지(P0a DoD).
const TABS = [
  { name: '지도', testId: 'page-map', path: '/' },
  { name: '일정', testId: 'page-calendar', path: '/calendar' },
  { name: '장소', testId: 'page-places', path: '/places' },
  { name: '추천', testId: 'page-discover', path: '/discover' },
  { name: '우리', testId: 'page-us', path: '/us' },
]

test('첫 화면은 지도이고 탭바가 보인다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('page-map')).toBeVisible()
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible()

  // 픽셀 스냅샷은 OS마다 렌더가 달라, 커밋된 같은-플랫폼 베이스라인이 있을 때만 실제 비교한다.
  // (베이스라인 없는 플랫폼=CI/Linux에서는 가짜 통과 대신 skip하여 비교 없음을 명시. SEED_SNAPSHOT=1로 최초 생성.)
  const baseline = fileURLToPath(
    new URL(
      `./smoke.spec.ts-snapshots/tab-map-mobile-chromium-${process.platform}.png`,
      import.meta.url,
    ),
  )
  test.skip(
    !process.env.SEED_SNAPSHOT && !existsSync(baseline),
    `이 플랫폼(${process.platform}) 스냅샷 베이스라인 없음 — 비교 생략(SEED_SNAPSHOT=1로 생성)`,
  )
  await expect(page).toHaveScreenshot('tab-map.png', { fullPage: true })
})

// '/' (지도)는 goto('/')만으로 이미 활성이라 클릭 동작 검증이 무의미 → 비-인덱스 탭만 클릭 네비 검증.
for (const tab of TABS.filter((t) => t.path !== '/')) {
  test(`탭 "${tab.name}"을 누르면 해당 화면이 렌더된다`, async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('page-map')).toBeVisible() // 출발점 = 지도
    await page.getByRole('link', { name: tab.name }).click()
    await expect(page.getByTestId(tab.testId)).toBeVisible()
    await expect(page).toHaveURL((url) => url.pathname === tab.path)
  })
}

// 지도 탭은 다른 탭에서 되돌아오는 경로로 검증(클릭이 실제로 작동함을 확인).
test('다른 탭에서 "지도"를 누르면 지도로 돌아온다', async ({ page }) => {
  await page.goto('/us')
  await expect(page.getByTestId('page-us')).toBeVisible()
  await page.getByRole('link', { name: '지도' }).click()
  await expect(page.getByTestId('page-map')).toBeVisible()
  await expect(page).toHaveURL((url) => url.pathname === '/')
})

test('알 수 없는 경로는 지도로 리다이렉트된다', async ({ page }) => {
  await page.goto('/nope')
  await expect(page.getByTestId('page-map')).toBeVisible()
})
