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

// ── ConnectPage(/onboarding) — 혼자 쓰는 중에 '상대 연결하기'로 들어온 화면 ──
// 0024 전에는 미연결(PENDING) 사용자가 가드에 갇혀 도달하는 화면이었다. 이제는 ACTIVE·상대 없음
// (혼자)에서 자발적으로 찾아온다 — seedAuthedMap({ solo: true })가 그 상태다.
async function seedSolo(page: import('@playwright/test').Page) {
  await seedAuthedMap(page, { solo: true })
  // 코드 만들기 RPC — idempotent 활성 코드 응답.
  await page.route('**/e2e.supabase.co/rest/v1/rpc/create_invite**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, code: 'ABCD2345' }),
    }),
  )
}

test('연결(/onboarding) — 가치 미리보기 + 코드 만들기/입력', async ({ page }) => {
  await seedSolo(page)
  await page.goto('/onboarding')
  // 둘이 쓰면 가능한 것(ValuePreview) + 코드 입력 섹션이 보인다(spec R3 §51).
  await expect(page.getByRole('heading', { name: '둘이 연결해요' })).toBeVisible()
  await expect(page.getByText('둘이 쓰면 이런 게 가능해요')).toBeVisible()
  await expect(page.getByRole('region', { name: '상대 코드 입력' })).toBeVisible()
  // 혼자 쓰는 사람이 이 화면에 갇히지 않는다(0024).
  await expect(page.getByRole('button', { name: '나중에 할게요' })).toBeVisible()
  const s = shot('connect')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

// ── 혼자 쓰기(0024) ──
// 예전에는 연결 전이면 어떤 탭도 못 봤다. 이제 로그인만으로 앱이 열리고, 연결은 우리 탭에서 한다.
test('혼자여도 지도 탭이 열린다 — 연결은 관문이 아니다', async ({ page }) => {
  await seedAuthedMap(page, {
    solo: true,
    places: [
      { id: 'p1', name: '속초 칠성조선소', address: '강원 속초시', region_label: '속초',
        lat: 38.2, lng: 128.59, category: '카페', kakao_place_id: 'k1',
        added_by: '00000000-0000-4000-8000-000000000a01', version: 1 },
    ],
  })
  await page.goto('/')
  await expect(page.getByText(/우리 장소 \d+곳/)).toBeVisible() // 목록은 장소 탭으로 이관
  // 연결 화면으로 튕기지 않는다.
  expect(new URL(page.url()).pathname).toBe('/')
})

test('우리(/us) — 혼자면 연결 안내 + 상대 연결하기', async ({ page }) => {
  await seedAuthedMap(page, { solo: true })
  await page.goto('/us')
  const card = page.getByRole('region', { name: '상대와 연결' })
  await expect(card).toBeVisible()
  await expect(card.getByText('아직 혼자 쓰는 중이에요')).toBeVisible()
  // 지금까지 담아둔 게 유지된다는 것을 말해준다 — 연결을 망설이게 하는 가장 큰 걱정이다.
  await expect(card.getByText(/그대로 둘의 것이 돼요/)).toBeVisible()
  const cta = card.getByRole('link', { name: '상대 연결하기' })
  await expect(cta).toBeVisible()
  // 터치 타깃 44px(§1).
  expect((await cta.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await cta.click()
  await expect(page.getByRole('heading', { name: '둘이 연결해요' })).toBeVisible()
})

test('우리(/us) — 상대가 있으면 연결 안내는 없다', async ({ page }) => {
  await seedAuthedMap(page) // 기본 시드 = user_b가 있는 커플
  await page.goto('/us')
  await expect(page.getByRole('region', { name: '상대와 연결' })).toHaveCount(0)
  // (상대 프로필 카드까지는 확인하지 않는다 — 하베스의 profiles 스텁이 self 행만 답하므로
  //  useCouple의 partner 조회가 null이 된다. 여기서 중요한 건 '혼자' 안내가 안 뜨는 것이다.)
  await expect(page.getByText('표시 이름')).toBeVisible()
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

// ── 프로필 사진 ──
// 실제 PNG 바이트를 넣어 **진짜 브라우저에서** 크롭까지 돌린다. jsdom에는 canvas·
// createImageBitmap이 없어 단위 테스트로는 여기까지 못 간다(순수 계산만 avatarCrop.test.ts).
// 40×30 가로 이미지 — 정사각이 아니라 pan 축이 살아 있는 케이스.
const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAAnklEQVR42u3NkQKFMAAF0FEUjUbRaBRFo1EURVE0iqJoNBqNoigaRVEURaMoiqJ9xfuNB/f8wCGEkCzL8jynlDLGiqLgnAshyrKsqkpKqZSq67ppmrZtu67r+15rPQzDOI7TNBljrLXOOe/9PM/LsqzrGkLYtm3f9+M4zvO8rivGeN/38zzv+37fl1IiiBEjRowYMWLEiBEjRoz4f+Mf81dtqz0E4gEAAAAASUVORK5CYII=',
  'base64',
)

test('우리(/us) — 사진 없으면 "사진 고르기"만, 지우기는 없다', async ({ page }) => {
  await seedAuthedMap(page)
  await page.goto('/us')
  await expect(page.getByRole('button', { name: /사진 고르기/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '지우기' })).toHaveCount(0)
  // 사진이 없을 땐 이니셜 폴백 — 색만으로 사람을 구분하지 않는다(§8).
  await expect(page.getByLabel('프로필 사진 파일 선택')).toHaveAttribute('accept', 'image/*')
})

test('우리(/us) — 사진 고르면 맞추기 시트가 열린다(끌기 대체 경로 포함)', async ({ page }) => {
  await seedAuthedMap(page)
  await page.goto('/us')
  await page.getByLabel('프로필 사진 파일 선택').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  const dialog = page.getByRole('dialog', { name: '프로필 사진 맞추기' })
  await expect(dialog).toBeVisible()
  // 확대는 range(키보드 가능), 이동은 방향키 안내가 붙은 그룹 — 제스처만으로 두지 않는다(ux §1).
  await expect(dialog.getByLabel('사진 크기')).toBeVisible()
  await expect(dialog.getByRole('group', { name: /사진 위치 조정/ })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '가운데로' })).toBeVisible()
  // 확대 슬라이더 터치 타깃 ≥44px(§1).
  const box = await dialog.getByLabel('사진 크기').boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
})

test('우리(/us) — 맞추고 저장하면 크롭본이 올라가고 프로필에 반영된다', async ({ page }) => {
  await seedAuthedMap(page)
  // Storage 업로드 가로채기 — 실제로 무엇이 올라가는지(경로·바이트 유무)를 본다.
  const uploaded: { url: string; bytes: number }[] = []
  await page.route('**/storage/v1/object/photos/**', async (route) => {
    if (route.request().method() === 'POST') {
      uploaded.push({
        url: route.request().url(),
        bytes: (route.request().postDataBuffer()?.length ?? 0),
      })
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"ok"}' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto('/us')
  await page.getByLabel('프로필 사진 파일 선택').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  const dialog = page.getByRole('dialog', { name: '프로필 사진 맞추기' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '저장' }).click()

  await expect(page.getByText('프로필 사진을 저장했어요')).toBeVisible()
  expect(uploaded).toHaveLength(1)
  // 경로 첫 세그먼트가 couple_id여야 Storage 격리 정책(0022)을 통과한다.
  expect(uploaded[0]!.url).toContain('/photos/c1/avatars/')
  expect(uploaded[0]!.bytes).toBeGreaterThan(0)
  await expect(dialog).toBeHidden()
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

// 다크에서 주 버튼 글자가 배경에 묻지 않는다 — 실제로 **번들된 CSS**로 확인한다.
// 소스 게이트(src/__tests__/cssContrast.test.ts)가 토큰 짝을 보증하지만, 그건 소스 이야기다.
// 여기선 브라우저가 계산한 값을 본다(빌드 파이프라인이 토큰을 날려먹는 경우까지 잡으려고).
// 픽셀 스냅샷으로는 못 잡는다 — 버튼 글자는 화면의 2% 미만이라 허용 오차에 묻힌다.
test('로그인 — 다크에서 주 버튼 글자가 배경에 묻지 않는다', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/auth')
  const cta = page.getByRole('button', { name: '로그인 링크 받기' })
  await expect(cta).toBeVisible()
  // getComputedStyle은 oklch()를 **그대로** 돌려준다(레거시 rgb로 안 내려온다).
  // 문자열을 파싱하려 들면 L·C·H를 r·g·b로 착각한다 — 캔버스에 1px 찍어 실제 sRGB를 읽는다.
  const { fg, bg, raw } = await cta.evaluate((el) => {
    const cs = getComputedStyle(el)
    const cv = document.createElement('canvas')
    cv.width = cv.height = 1
    const ctx = cv.getContext('2d')!
    const px = (c: string): [number, number, number] => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = c
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      return [d[0]!, d[1]!, d[2]!]
    }
    return { fg: px(cs.color), bg: px(cs.backgroundColor), raw: `${cs.color} / ${cs.backgroundColor}` }
  })
  const lum = ([r, g, b]: number[]): number => {
    const ch = (v = 0) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
  }
  const [hi = 0, lo = 0] = [lum(fg), lum(bg)].sort((a, b) => b - a)
  const ratio = (hi + 0.05) / (lo + 0.05)
  expect(ratio, `다크 CTA 대비 ${ratio.toFixed(2)}:1 (${raw})`).toBeGreaterThanOrEqual(4.5)
})
