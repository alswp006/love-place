import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// P0b 이후: 탭은 로그인 뒤에 있다. 키 없는 빌드(e2e 환경)에선 비로그인 → /auth(로그인 화면)로 간다.
// 로그인 후 화면은 인증이 필요해 e2e 스모크에선 다루지 않고, 라우팅/렌더 단위는 vitest가 검증.

test('보호된 루트(/)는 로그인 화면으로 보낸다', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL((url) => url.pathname === '/auth')
  await expect(page.getByRole('heading', { name: 'love place' })).toBeVisible()
})

test('로그인 화면이 모바일 뷰포트에서 렌더된다', async ({ page }) => {
  await page.goto('/auth')
  await expect(page.getByRole('heading', { name: 'love place' })).toBeVisible()

  // 픽셀 스냅샷은 OS마다 렌더가 달라, 커밋된 같은-플랫폼 베이스라인이 있을 때만 실제 비교한다.
  const baseline = fileURLToPath(
    new URL(
      `./smoke.spec.ts-snapshots/login-mobile-chromium-${process.platform}.png`,
      import.meta.url,
    ),
  )
  test.skip(
    !process.env.SEED_SNAPSHOT && !existsSync(baseline),
    `이 플랫폼(${process.platform}) 스냅샷 베이스라인 없음 — 비교 생략(SEED_SNAPSHOT=1로 생성)`,
  )
  await expect(page).toHaveScreenshot('login.png', { fullPage: true })
})

test('알 수 없는 경로도 (비로그인 시) 로그인으로 수렴한다', async ({ page }) => {
  await page.goto('/nope')
  await expect(page).toHaveURL((url) => url.pathname === '/auth')
})

test('통합 후 /places는 (비로그인 시) 로그인으로 수렴한다', async ({ page }) => {
  await page.goto('/places')
  await expect(page).toHaveURL((url) => url.pathname === '/auth')
})
