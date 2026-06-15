import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { seedAuthedMap } from './harness/seed'

const PLACES = [
  { id: 'p1', name: '속초 칠성조선소', address: '강원 속초시', region_label: '속초', lat: 38.2, lng: 128.59, category: '카페', kakao_place_id: 'k1', added_by: '00000000-0000-4000-8000-000000000a01', version: 1 },
  { id: 'p2', name: '강릉 안목해변', address: '강원 강릉시', region_label: '강릉', lat: 37.77, lng: 128.95, category: '관광', kakao_place_id: 'k2', added_by: '00000000-0000-4000-8000-000000000a01', version: 1 },
]

function shot(name: string) {
  const baseline = fileURLToPath(new URL(`./map-harness.spec.ts-snapshots/${name}-mobile-chromium-${process.platform}.png`, import.meta.url))
  return { skip: !process.env.SEED_SNAPSHOT && !existsSync(baseline), file: `${name}.png` }
}

// 시드된 장소가 있으면 첫 로딩 플래시(placesLoading) 동안 시트가 half로 자동 오픈되어 latch된다(spec §3.3).
// peek 전제(플로팅 버튼/오버레이 가시)를 검증하려면, 데이터가 정착해 latch가 끝난 뒤(백드롭 등장)
// 백드롭을 눌러 명시적으로 peek로 접고, 핸들의 aria-expanded=false로 정착을 확인한다(race 방지).
async function collapseToPeek(page: import('@playwright/test').Page) {
  // 리스트가 떠야(=로딩 종료) auto-half latch가 확정된다. 그 직후에만 collapse가 의미 있음.
  await expect(page.getByText('속초 칠성조선소')).toBeVisible()
  const handle = page.getByRole('button', { name: /시트 펼치기|시트 단계 전환/ })
  // half이면 백드롭으로 peek로 접는다. 백드롭은 전체화면이지만 시트(z45)가 하단을 덮으므로
  // 시트에 가리지 않는 상단 지도 밴드(y≈20)를 눌러 backdrop의 onClick(setSnap('peek'))을 친다.
  if ((await handle.getAttribute('aria-expanded')) === 'true') {
    await page.getByRole('button', { name: '시트 접기' }).click({ position: { x: 50, y: 20 } })
  }
  await expect(handle).toHaveAttribute('aria-expanded', 'false')
}

test('빈 상태(0곳) — peek 요약', async ({ page }) => {
  await seedAuthedMap(page, {})
  await page.goto('/')
  // 시트는 role="region"(PlaceSheet.tsx — 항상 보이는 패널, modal 아님). 실제 컴포넌트에 맞춰 region으로 검증.
  await expect(page.getByRole('region', { name: '장소 시트' })).toBeVisible()
  const s = shot('map-empty')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

test('장소 N개 — 리스트 렌더', async ({ page }) => {
  await seedAuthedMap(page, { places: PLACES })
  await page.goto('/')
  await expect(page.getByText('속초 칠성조선소')).toBeVisible()
  const s = shot('map-places')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

test('선택 상세 — 리스트 탭 시 시트가 half로 상세 표시', async ({ page }) => {
  await seedAuthedMap(page, { places: PLACES })
  await page.goto('/')
  // peek에선 리스트가 화면 밖(뷰포트 아래) — 핸들로 한 단계 펼쳐 리스트를 노출한 뒤 탭한다(플랜 §162 "리스트 선택 구동").
  await page.getByRole('button', { name: '시트 펼치기' }).click()
  await page.getByRole('button', { name: '속초 칠성조선소 지도에서 보기' }).click()
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
  // 시드 장소가 있으면 로딩 플래시로 시트가 half에 latch되므로 먼저 peek로 접는다(아래 §collapseToPeek).
  await collapseToPeek(page)
  // peek에서는 보임(탭바 위 가시 밴드).
  await expect(locBtn).toBeVisible()
  await expect(locBtn).not.toHaveAttribute('data-hidden', 'true')
  // 핸들을 눌러 half로 펼치면(snap>peek) 버튼은 data-hidden=true로 숨겨 시트에 가리지 않는다.
  await page.getByRole('button', { name: '시트 펼치기' }).click()
  await expect(locBtn).toHaveAttribute('data-hidden', 'true')
  await expect(locBtn).toBeHidden()
})

test('검색 오버레이는 시트가 half로 펼쳐지면(snap>peek) 접힌다', async ({ page }) => {
  await seedAuthedMap(page, { places: PLACES })
  await page.goto('/')
  const overlay = page.getByTestId('search-overlay')
  // 시드 장소가 있으면 로딩 플래시로 시트가 half에 latch되므로 먼저 peek로 접는다.
  await collapseToPeek(page)
  await expect(overlay).toBeVisible()
  await page.getByRole('button', { name: '시트 펼치기' }).click() // peek→half
  await expect(overlay).toHaveAttribute('data-hidden', 'true')
  await expect(overlay).toBeHidden()
})

test('다크 모드 — 빈 상태', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await seedAuthedMap(page, { places: PLACES })
  await page.goto('/')
  await expect(page.getByText('속초 칠성조선소')).toBeVisible()
  const s = shot('map-dark')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

test('peek↔half — 핸들 aria-expanded 토글', async ({ page }) => {
  await seedAuthedMap(page, { places: PLACES })
  await page.goto('/')
  await collapseToPeek(page)
  // peek: 핸들은 '시트 펼치기' + aria-expanded=false.
  const handle = page.getByRole('button', { name: '시트 펼치기' })
  await expect(handle).toHaveAttribute('aria-expanded', 'false')
  // half로 펼치면 aria-expanded=true(같은 핸들 노드, 라벨 유지).
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
  await collapseToPeek(page)
  await page.getByLabel('장소 검색').fill('식당')
  await page.getByText('새 후보 식당').click()
  await expect(page.getByLabel('검색 결과 미리보기')).toBeVisible()
  // 프리뷰는 시트 body에 있어 peek에선 화면 밖 — 핸들로 half까지 올려 프리뷰 상세를 스냅샷에 담는다.
  await page.getByRole('button', { name: '시트 펼치기' }).click()
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
    await expect(page.getByRole('region', { name: '장소 시트' })).toBeVisible()
    const s = shot('map-small')
    test.skip(s.skip, `베이스라인 없음(${process.platform})`)
    await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
  })
})
