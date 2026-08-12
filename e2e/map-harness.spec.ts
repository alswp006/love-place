import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { seedAuthedMap, USER_A } from './harness/seed'

const PLACES = [
  { id: 'p1', name: '속초 칠성조선소', address: '강원 속초시', region_label: '속초', lat: 38.2, lng: 128.59, category: '카페', kakao_place_id: 'k1', added_by: '00000000-0000-4000-8000-000000000a01', version: 1 },
  { id: 'p2', name: '강릉 안목해변', address: '강원 강릉시', region_label: '강릉', lat: 37.77, lng: 128.95, category: '관광', kakao_place_id: 'k2', added_by: '00000000-0000-4000-8000-000000000a01', version: 1 },
]

function shot(name: string) {
  const baseline = fileURLToPath(new URL(`./map-harness.spec.ts-snapshots/${name}-mobile-chromium-${process.platform}.png`, import.meta.url))
  return { skip: !process.env.SEED_SNAPSHOT && !existsSync(baseline), file: `${name}.png` }
}

// 2026-08: 시트는 '고른 장소가 있을 때만' 마운트된다(MapPage의 sheetOpen). 그래서 예전처럼
// '떠 있는 시트를 peek로 접는' 준비 동작이 필요 없다 — 선택이 없으면 시트 자체가 없다.
// 선택이 있는 상태에서 peek까지 접는 건 여전히 가능해야 한다(그게 안 돼서 지도가 잠기던 버그를 고쳤다).
async function collapseOpenSheet(page: import('@playwright/test').Page) {
  const handle = page.getByRole('button', { name: /시트 펼치기|시트 단계 전환/ })
  await expect(handle).toHaveAttribute('aria-expanded', 'true')
  // 백드롭은 전체화면이지만 위는 검색 오버레이(z50), 아래는 시트가 덮는다. 그 사이의 지도 밴드를 누른다
  // (y=20으로 두면 검색창을 눌러 클릭이 영영 안 먹는다 — 실제로 그렇게 타임아웃 났다).
  await page.getByRole('button', { name: '시트 접기' }).click({ position: { x: 50, y: 200 } })
  await expect(handle).toHaveAttribute('aria-expanded', 'false')
}

test('빈 상태(0곳) — 시트 없이 지도만', async ({ page }) => {
  await seedAuthedMap(page, {})
  await page.goto('/')
  // 고른 장소가 없으면 시트를 아예 띄우지 않는다 — 빈 띠가 지도 아래를 차지하지 않게(2026-08).
  await expect(page.getByTestId('search-overlay')).toBeVisible()
  await expect(page.getByRole('region', { name: '장소 시트' })).toHaveCount(0)
  const s = shot('map-empty')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

test('장소 N개 — 지도는 핀으로만 말한다(목록·요약은 장소 탭으로 이관)', async ({ page }) => {
  await seedAuthedMap(page, { places: PLACES })
  await page.goto('/')
  await expect(page.getByRole('button', { name: /속초 칠성조선소 — 가고싶음/ })).toBeVisible()
  // 목록도, '우리 장소 N곳' 요약 띠도 여기 없다.
  await expect(page.getByRole('region', { name: '장소 시트' })).toHaveCount(0)
  const s = shot('map-places')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

test('선택 상세 — 장소를 고르면 시트가 half로 상세 표시', async ({ page }) => {
  await seedAuthedMap(page, { places: PLACES })
  // 목록이 장소 탭으로 옮겨간 뒤 지도에서 장소를 고르는 경로는 마커 탭과 ?place= 딥링크 둘이다.
  // 여기선 딥링크로 구동한다 — 마커는 지도 idle/zoom마다 통째로 파괴·재생성돼서(NaverMap.render)
  // Playwright의 actionability 'stable' 검사를 통과하지 못한다(클릭이 30초 타임아웃).
  // 마커 자체가 뜨는지는 위 '지도 마커 + 시트 요약' 테스트가 본다.
  await page.goto('/?place=p1')
  // 시트는 role="region"(PlaceSheet.tsx). 선택 후에도 시트는 표시된다.
  await expect(page.getByRole('region', { name: '장소 시트' })).toBeVisible()
  const s = shot('map-selected')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

test('내 위치 버튼은 시트가 half로 펼쳐지면 가려지지 않게 숨는다(snap>peek)', async ({ page }) => {
  await seedAuthedMap(page, { places: PLACES })
  await page.goto('/')
  // 숨김 시 aria-hidden=true가 붙어 getByRole(a11y 트리)에서 사라지므로, role 대신 attribute 셀렉터로
  // DOM 노드를 직접 잡아 data-hidden/가시성을 검증한다(플랜의 getByRole은 aria-hidden과 모순이라 적응).
  const locBtn = page.locator('button[aria-label="내 위치로 이동"]')
  // 시트가 없을 땐 보인다(지도 전체가 내 것).
  await expect(locBtn).toBeVisible()
  await expect(locBtn).not.toHaveAttribute('data-hidden', 'true')
  // 장소를 고르면 시트가 올라오고(half), 버튼은 가려지지 않게 스스로 숨는다.
  await page.goto('/?place=p1')
  await expect(page.getByRole('region', { name: '장소 시트' })).toBeVisible()
  await expect(locBtn).toHaveAttribute('data-hidden', 'true')
  await expect(locBtn).toBeHidden()
})

// 계약 변경(의도적): 예전 이름은 "half로 펼쳐지면 접힌다"였다. half에서 접으면 검색결과 탭으로
// 시트가 자동 승격되는 순간 검색창이 사라져 위시 저장이 4탭이 된다(§8은 ≤3탭을 약속).
// 이제 half에서는 유지하고 full에서만 접는다.
test('검색 오버레이는 half에서 유지되고 full에서만 접힌다', async ({ page }) => {
  await seedAuthedMap(page, { places: PLACES })
  await page.goto('/')
  const overlay = page.getByTestId('search-overlay')
  await expect(overlay).toBeVisible() // 시트 없음
  await page.goto('/?place=p1') // 선택 → 시트 half
  await expect(overlay).not.toHaveAttribute('data-hidden', 'true') // half에서는 유지(≤3탭 보존)
  await page.getByRole('button', { name: /시트 펼치기|시트 단계 전환/ }).click() // half→full
  await expect(overlay).toHaveAttribute('data-hidden', 'true')
  await expect(overlay).toBeHidden()
})

test('다크 모드 — 빈 상태', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await seedAuthedMap(page, { places: PLACES })
  await page.goto('/')
  await expect(page.getByRole('button', { name: /속초 칠성조선소 — 가고싶음/ })).toBeVisible()
  const s = shot('map-dark')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

test('상세를 연 채로도 시트를 peek까지 접었다 다시 펼 수 있다(지도 잠김 회귀)', async ({ page }) => {
  // 회귀 방어: 선택이 살아 있는 동안 시트가 peek에 못 머물러, 딤이 걷히지 않고 전체화면 백드롭이
  // 지도 조작을 통째로 삼키던 버그가 있었다. 탈출구가 시트 안 ✕ 하나뿐이었다.
  await seedAuthedMap(page, { places: PLACES })
  await page.goto('/?place=p1')
  await collapseOpenSheet(page) // 선택이 있어도 peek로 내려가야 한다
  const handle = page.getByRole('button', { name: /시트 펼치기|시트 단계 전환/ })
  await handle.click()
  await expect(handle).toHaveAttribute('aria-expanded', 'true')
})

// 플랜 §2113 검색 프리뷰 — 결과 탭 → 시트에 PlacePreviewDetail(aria-label="검색 결과 미리보기").
// 플랜의 getByLabelText는 RTL API라 Playwright에선 getByLabel로 적응(동작 동일). 프록시는 naver-search.
test('검색 프리뷰 — 결과 탭 시 시트에 프리뷰 상세', async ({ page }) => {
  await seedAuthedMap(page, { places: PLACES })
  await page.route('**/e2e.supabase.co/functions/v1/naver-search**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, hits: [
      { kakaoPlaceId: 'kx', name: '새 후보 식당', address: '서울 중구', lat: 37.56, lng: 126.98, category: '식당', placeUrl: '' },
    ] }) }))
  await page.goto('/')
  // 검색 오버레이는 peek에서만 보이므로 먼저 peek로 접고 검색 → 결과 탭(프리뷰 set).
  // (선택 전엔 시트가 없다 — 예전의 'peek로 접기' 준비 동작은 불필요해졌다)
  await page.getByLabel('장소 검색').fill('식당')
  await page.getByText('새 후보 식당').click()
  await expect(page.getByLabel('검색 결과 미리보기')).toBeVisible()
  // 프리뷰는 시트 body에 있어 peek에선 화면 밖 — 핸들로 half까지 올려 프리뷰 상세를 스냅샷에 담는다.
  // 결과를 고르면 시트가 스스로 올라온다(선택 발생 → half). 예전엔 손으로 펼쳐야 했다.
  await expect(page.getByRole('button', { name: '새 후보 식당 저장' })).toBeVisible()
  const s = shot('map-preview')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

test.describe('작은/큰 뷰포트', () => {
  test.use({ viewport: { width: 360, height: 740 } })
  test('작은 화면 — 빈 상태', async ({ page }) => {
    await seedAuthedMap(page, {})
    await page.goto('/')
    await expect(page.getByTestId('search-overlay')).toBeVisible()
    await expect(page.getByRole('region', { name: '장소 시트' })).toHaveCount(0)
    const s = shot('map-small')
    test.skip(s.skip, `베이스라인 없음(${process.platform})`)
    await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
  })
})

test('사진 — 목록 카드에 썸네일, 없으면 슬롯 자체를 안 그린다(장소 탭)', async ({ page }) => {
  // 회색 자리표시는 빈 화면보다 나쁘다(§7) — 사진이 없을 때 빈 박스가 생기지 않는지가 요점.
  // 목록이 장소 탭으로 옮겨졌으므로(2026-08) 검증 장소도 함께 옮긴다.
  const PLACES = [
    { id: 'p1', name: '사진 있는 곳', address: '속초시', region_label: '속초', lat: 38.2, lng: 128.59, category: null, kakao_place_id: 'k1', added_by: USER_A, version: 1 },
    { id: 'p2', name: '사진 없는 곳', address: '속초시', region_label: '속초', lat: 38.21, lng: 128.6, category: null, kakao_place_id: 'k2', added_by: USER_A, version: 1 },
  ]
  await seedAuthedMap(page, {
    places: PLACES,
    photos: [
      {
        id: 'ph1', storage_url: 'c1/ph1.webp', thumbnail_url: 'c1/ph1_t.webp',
        place_id: 'p1', trip_id: null, taken_at: null, caption: null,
        uploaded_by: USER_A, version: 1,
      },
    ],
  })
  // 서명 URL(Storage API) — 응답 키는 signedURL(대문자 URL)이고 클라이언트가 base URL을 앞에
  // 붙여 signedUrl로 바꾼다. 여기선 앞에 붙어도 무해한 절대경로를 주고, 그 경로에 1×1 PNG를 세운다.
  await page.route('**/e2e.supabase.co/storage/v1/object/sign/photos**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ error: null, path: 'c1/ph1_t.webp', signedURL: '/e2e-photo.png' }]),
    }),
  )
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  )
  await page.route('**/e2e-photo.png', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: png }),
  )
  await page.goto('/places')

  const withPhoto = page.getByRole('button', { name: /사진 있는 곳 지도에서 보기/ })
  const without = page.getByRole('button', { name: /사진 없는 곳 지도에서 보기/ })
  await expect(withPhoto.locator('img')).toHaveCount(1)
  await expect(without.locator('img')).toHaveCount(0)
})
