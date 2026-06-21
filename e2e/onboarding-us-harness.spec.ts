import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { seedAuthedMap } from './harness/seed'

// R3 비주얼 스모크(Task 19) — ConnectPage(가치 미리보기+초대),
// UsPage(프로필 편집·휴지통·연결해제 다이얼로그), LoginPage 발송-후(OTP) 상태.
// (온보딩 동의 위저드는 제거됨 — 연결=공유 기본값 §1.)
// 픽셀 스냅샷은 OS마다 달라 같은-플랫폼 베이스라인이 있을 때만 비교(map/calendar harness와 동일 가드).
// 기능 assertion(toBeVisible/role)이 1차 게이트, 픽셀은 darwin 베이스라인 한정 보강.

function shot(name: string) {
  const baseline = fileURLToPath(
    new URL(
      `./onboarding-us-harness.spec.ts-snapshots/${name}-mobile-chromium-${process.platform}.png`,
      import.meta.url,
    ),
  )
  return { skip: !process.env.SEED_SNAPSHOT && !existsSync(baseline), file: `${name}.png` }
}

// ── ConnectPage(/onboarding) — 미연결 상태에서 가치 미리보기 + ① 코드 만들기 / ② 코드 입력 ──
// couples 행을 PENDING으로 시드해 가드가 /onboarding에 머물게 한다(ACTIVE면 steps로 보냄).
async function seedPending(page: import('@playwright/test').Page) {
  await seedAuthedMap(page)
  await page.route('**/e2e.supabase.co/rest/v1/couples**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'c1',
        status: 'PENDING',
        user_a: '00000000-0000-4000-8000-000000000a01',
        user_b: null,
        connected_at: null,
      }),
    }),
  )
  // PENDING create_invite RPC(코드 재표시) — idempotent 활성 코드 응답.
  await page.route('**/e2e.supabase.co/rest/v1/rpc/create_invite**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, code: 'ABCD2345' }),
    }),
  )
}

test('연결(/onboarding) — 가치 미리보기 + 코드 만들기/입력', async ({ page }) => {
  await seedPending(page)
  await page.goto('/onboarding')
  // 둘이 쓰면 가능한 것(ValuePreview) + 코드 입력 섹션이 보인다(미연결 온보딩, spec R3 §51).
  await expect(page.getByRole('heading', { name: '둘이 연결해요' })).toBeVisible()
  await expect(page.getByText('둘이 쓰면 이런 게 가능해요')).toBeVisible()
  await expect(page.getByRole('region', { name: '상대 코드 입력' })).toBeVisible()
  const s = shot('connect')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

// ── UsPage(/us) — 내 계정(프로필 편집)·내보내기·휴지통·연결 해제 ──
test('우리(/us) — 프로필 편집·내보내기·휴지통·연결 해제', async ({ page }) => {
  await seedAuthedMap(page)
  await page.goto('/us')
  // 프로필 편집기(표시 이름) + 내보내기(회수권) + 휴지통 + 연결 해제 섹션.
  await expect(page.getByText('표시 이름')).toBeVisible()
  await expect(page.getByRole('region', { name: '데이터 내보내기' })).toBeVisible()
  await expect(page.getByRole('button', { name: /휴지통/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '연결 해제' })).toBeVisible()
  const s = shot('us')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

test('우리(/us) — 연결 해제 확인 다이얼로그(정직 카피 + 내보내기 게이트)', async ({ page }) => {
  await seedAuthedMap(page)
  await page.goto('/us')
  await page.getByRole('button', { name: '연결 해제' }).click()
  // Dialog는 role=dialog + aria-label로 접근. 정직 카피(해제 전 내보내기)가 보인다(§10.4).
  const dialog = page.getByRole('dialog', { name: '연결 해제 확인' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(/해제 전에 반드시/)).toBeVisible()
  const s = shot('us-disconnect')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

// ── UsPage 다크 모드 ──
test('우리(/us) — 다크 모드', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await seedAuthedMap(page)
  await page.goto('/us')
  await expect(page.getByRole('button', { name: '연결 해제' })).toBeVisible()
  const s = shot('us-dark')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

// ── LoginPage 발송-후(sent) 상태 — OTP 코드 입력 + 다시 보내기(쿨다운) ──
// e2e 빌드는 Supabase가 설정돼 있으므로(configured) sendMagicLink가 sent 상태로 진입한다.
test('로그인 — 메일 발송 후 OTP 코드 입력 화면', async ({ page }) => {
  // 매직링크 OTP 발송(otp endpoint)을 성공 응답으로 스텁 → status=sent 진입.
  await page.route('**/e2e.supabase.co/auth/v1/otp**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
  await page.goto('/auth')
  await page.getByLabel('이메일').fill('you@example.com')
  await page.getByRole('button', { name: '로그인 링크 받기' }).click()
  // 발송-후 상태 — 메일 확인 안내 + 6자리 코드 입력 + 다시 보내기(쿨다운).
  await expect(page.getByText('📬 메일을 확인하세요')).toBeVisible()
  await expect(page.getByLabel('6자리 코드')).toBeVisible()
  await expect(page.getByRole('button', { name: '코드로 로그인' })).toBeVisible()
  // 쿨다운 카운트다운(초)은 비결정적이므로 픽셀 스냅샷은 두지 않고 기능 assertion만 둔다.
})

test('로그인 — 발송 후 다크 모드', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.route('**/e2e.supabase.co/auth/v1/otp**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
  await page.goto('/auth')
  await page.getByLabel('이메일').fill('you@example.com')
  await page.getByRole('button', { name: '로그인 링크 받기' }).click()
  await expect(page.getByText('📬 메일을 확인하세요')).toBeVisible()
})
