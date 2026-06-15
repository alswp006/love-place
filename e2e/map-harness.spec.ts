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

test('빈 상태(0곳) — peek 요약', async ({ page }) => {
  await seedAuthedMap(page, {})
  await page.goto('/')
  // 시트는 role="region"(PlaceSheet.tsx — 항상 보이는 패널, modal 아님). 실제 컴포넌트에 맞춰 region으로 검증.
  await expect(page.getByRole('region', { name: '장소 시트' })).toBeVisible()
  const s = shot('map-empty')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true })
})

test('장소 N개 — 리스트 렌더', async ({ page }) => {
  await seedAuthedMap(page, { places: PLACES })
  await page.goto('/')
  await expect(page.getByText('속초 칠성조선소')).toBeVisible()
  const s = shot('map-places')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true })
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
  await expect(page).toHaveScreenshot(s.file, { fullPage: true })
})

test('내 위치 버튼은 시트가 half로 펼쳐지면 가려지지 않게 숨는다(snap>peek)', async ({ page }) => {
  await seedAuthedMap(page, { places: PLACES })
  await page.goto('/')
  // 숨김 시 aria-hidden=true가 붙어 getByRole(a11y 트리)에서 사라지므로, role 대신 attribute 셀렉터로
  // DOM 노드를 직접 잡아 data-hidden/가시성을 검증한다(플랜의 getByRole은 aria-hidden과 모순이라 적응).
  const locBtn = page.locator('button[aria-label="내 위치로 이동"]')
  // peek에서는 보임(탭바 위 가시 밴드).
  await expect(locBtn).toBeVisible()
  await expect(locBtn).not.toHaveAttribute('data-hidden', 'true')
  // 핸들을 눌러 half로 펼치면(snap>peek) 버튼은 data-hidden=true로 숨겨 시트에 가리지 않는다.
  await page.getByRole('button', { name: '시트 펼치기' }).click()
  await expect(locBtn).toHaveAttribute('data-hidden', 'true')
  await expect(locBtn).toBeHidden()
})

test('다크 모드 — 빈 상태', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await seedAuthedMap(page, { places: PLACES })
  await page.goto('/')
  await expect(page.getByText('속초 칠성조선소')).toBeVisible()
  const s = shot('map-dark')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true })
})
