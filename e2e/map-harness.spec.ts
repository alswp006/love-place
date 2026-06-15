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
  // 시트는 role="dialog"(PlaceSheet.tsx) — 플랜 본문의 role:'region'은 실제 컴포넌트와 안 맞아 dialog로 적응.
  await expect(page.getByRole('dialog', { name: '장소 시트' })).toBeVisible()
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
  // 시트는 role="dialog"(PlaceSheet.tsx) — 플랜 본문의 role:'region'을 dialog로 적응. 선택 후에도 시트는 표시된다.
  await expect(page.getByRole('dialog', { name: '장소 시트' })).toBeVisible()
  const s = shot('map-selected')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true })
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
