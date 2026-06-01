import { test, expect } from '@playwright/test'

// 비주얼 스모크 — 5탭 셸이 모바일 뷰포트에서 렌더되고 탭 네비게이션이 동작하는지(P0a DoD).
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
  // 폰트 안티앨리어싱·렌더가 OS마다 달라 픽셀 차이가 나므로 허용오차를 둔다(로컬 darwin ↔ CI linux).
  await expect(page).toHaveScreenshot('tab-map.png', { fullPage: true, maxDiffPixelRatio: 0.02 })
})

for (const tab of TABS) {
  test(`탭 "${tab.name}"을 누르면 해당 화면이 렌더된다`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: tab.name }).click()
    await expect(page.getByTestId(tab.testId)).toBeVisible()
    await expect(page).toHaveURL((url) => url.pathname === tab.path)
  })
}

test('알 수 없는 경로는 지도로 리다이렉트된다', async ({ page }) => {
  await page.goto('/nope')
  await expect(page.getByTestId('page-map')).toBeVisible()
})
