import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { blockFonts } from './harness/seed'

// P0b 이후: 탭은 로그인 뒤에 있다. 키 없는 빌드(e2e 환경)에선 비로그인 → /auth(로그인 화면)로 간다.
// 로그인 후 화면은 인증이 필요해 e2e 스모크에선 다루지 않고, 라우팅/렌더 단위는 vitest가 검증.

test('보호된 루트(/)는 로그인 화면으로 보낸다', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL((url) => url.pathname === '/auth')
  await expect(page.getByRole('heading', { name: 'Weave' })).toBeVisible()
})

test('로그인 화면이 모바일 뷰포트에서 렌더된다', async ({ page }) => {
  await blockFonts(page) // 결정론적 폴백 폰트(스냅샷 플래키 제거)
  await page.goto('/auth')
  await expect(page.getByRole('heading', { name: 'Weave' })).toBeVisible()

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

// ── 공개 법무 문서 ──
// App Store Connect의 '개인정보처리방침 URL'과 심사관이 **로그인 없이** 여기로 온다.
// 가드 안에 있으면 /auth로 튕겨 심사에서 막힌다 — 그래서 비로그인 접근을 못박는다.
for (const [path, heading] of [
  ['/privacy', '개인정보처리방침'],
  ['/location-policy', '위치정보처리방침'],
] as const) {
  test(`${path} — 비로그인도 열리고 자리표시자가 남아 있지 않다`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: new RegExp(heading) })).toBeVisible()
    // 로그인으로 튕기지 않았다.
    expect(new URL(page.url()).pathname).toBe(path)
    // `[사업자명]` 같은 자리표시자가 그대로 노출되면 심사 반려 + 법적 고지로 무효다.
    const body = await page.locator('body').innerText()
    expect(body).not.toMatch(/\[[^\]\n]{2,20}\]/)
    // 내부 메모가 새지 않는다.
    expect(body).not.toContain('내부 메모')
    // 연락처가 실제로 적혀 있다(정보주체가 문의할 방법).
    expect(body).toContain('@')
  })
}

test('로그인 화면에서 비밀번호 로그인이 열린다 — 심사관 데모 계정 경로', async ({ page }) => {
  await page.goto('/auth')
  // 접혀 있다가 눌러야 열린다(실사용자는 매직링크·소셜을 쓴다).
  const disclosure = page.getByText('비밀번호로 로그인', { exact: true }).first()
  await expect(disclosure).toBeVisible()
  await disclosure.click()
  await expect(page.getByLabel('비밀번호', { exact: true })).toBeVisible()
})
