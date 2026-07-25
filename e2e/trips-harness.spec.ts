import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { seedAuthedMap, USER_A } from './harness/seed'

// 여행 탭 비주얼/기능 스모크 — 목록(빈 상태·카드) + 상세(Day 슬롯·스톱·담기 패널).
// 픽셀 스냅샷은 OS마다 달라 같은-플랫폼 베이스라인이 있을 때만 비교(다른 하베스와 동일 가드).
// 기능 assertion이 1차 게이트.

// 실행 시점(오늘)에 의존하지 않게 고정 미래/과거 날짜를 쓴다 — 상태 칩이 흔들리지 않는다.
const FUTURE_START = '2030-03-15'
const FUTURE_END = '2030-03-16'

const TRIPS = [
  { id: 't1', title: '속초 1박2일', start_date: FUTURE_START, end_date: FUTURE_END, region_code: null, version: 1 },
  { id: 't2', title: '지난 제주', start_date: '2020-05-01', end_date: '2020-05-03', region_code: null, version: 1 },
]

const PLACES = [
  { id: 'p1', name: '칠성조선소', address: '속초시', region_label: '속초', lat: 38.2, lng: 128.59, category: null, kakao_place_id: 'k1', added_by: USER_A, version: 1 },
  { id: 'p2', name: '영금정', address: '속초시', region_label: '속초', lat: 38.21, lng: 128.6, category: null, kakao_place_id: 'k2', added_by: USER_A, version: 1 },
]

const EVENTS = [
  {
    id: 'e1', title: '칠성조선소',
    start: `${FUTURE_START}T09:00:00+09:00`, end: `${FUTURE_START}T10:00:00+09:00`,
    is_all_day: false, time_zone: 'Asia/Seoul', visibility: 'SHARED', participants: 'BOTH',
    owner_id: USER_A, place_id: 'p1', memo: null, recurrence_rule: null, reminders: [], version: 1,
  },
  {
    id: 'e2', title: '영금정',
    start: `${FUTURE_START}T14:00:00+09:00`, end: `${FUTURE_START}T15:00:00+09:00`,
    is_all_day: false, time_zone: 'Asia/Seoul', visibility: 'SHARED', participants: 'BOTH',
    owner_id: USER_A, place_id: 'p2', memo: null, recurrence_rule: null, reminders: [], version: 1,
  },
]

function shot(name: string) {
  const baseline = fileURLToPath(
    new URL(`./trips-harness.spec.ts-snapshots/${name}-mobile-chromium-${process.platform}.png`, import.meta.url),
  )
  return { skip: !process.env.SEED_SNAPSHOT && !existsSync(baseline), file: `${name}.png` }
}

test('여행 탭이 하단 탭바에서 열린다(5탭 IA)', async ({ page }) => {
  await seedAuthedMap(page, { trips: TRIPS })
  await page.goto('/')
  await page.getByRole('link', { name: '여행' }).click()
  await expect(page).toHaveURL(/\/trips$/)
  await expect(page.getByTestId('page-trips')).toBeVisible()
})

test('연결됨-빈 — 여행이 없으면 친근한 빈 상태 + CTA', async ({ page }) => {
  await seedAuthedMap(page, { trips: [] })
  await page.goto('/trips')
  await expect(page.getByText('아직 만든 여행이 없어요')).toBeVisible()
  await expect(page.getByRole('link', { name: '가고싶은 곳 먼저 모으기' })).toBeVisible()
  const s = shot('trips-empty')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

test('목록 — 상태 칩은 색이 아니라 텍스트로 말한다', async ({ page }) => {
  await seedAuthedMap(page, { trips: TRIPS, events: EVENTS })
  await page.goto('/trips')
  await expect(page.getByText('속초 1박2일')).toBeVisible()
  // 미래 여행은 D-n, 지난 여행은 'n일 전' — 색 없이도 구분된다(§8).
  await expect(page.getByText(/^D-\d+$/)).toBeVisible()
  await expect(page.getByText(/일 전$/)).toBeVisible()
  // 담은 곳 수는 events에서 도출(별도 저장 없음).
  await expect(page.getByText(/담은 곳 2/)).toBeVisible()
  const s = shot('trips-list')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

test('상세 — Day 슬롯이 기간에서 도출되고 스톱이 시간순으로 뜬다', async ({ page }) => {
  await seedAuthedMap(page, { trips: TRIPS, events: EVENTS, places: PLACES })
  await page.goto('/trips')
  await page.getByRole('link', { name: '속초 1박2일 여행 상세 열기' }).click()
  await expect(page).toHaveURL(/\/trips\/t1$/)

  const dayBar = page.getByRole('group', { name: '여행 날짜 선택' })
  await expect(dayBar.getByText('Day 1')).toBeVisible()
  await expect(dayBar.getByText('Day 2')).toBeVisible()

  await expect(page.getByText('칠성조선소')).toBeVisible()
  await expect(page.getByText('09:00')).toBeVisible()

  // Day 2로 넘기면 비어 있고, 죽은 화면 대신 담기 유도가 뜬다(§7).
  await dayBar.getByText('Day 2').click()
  await expect(page.getByText('이 날은 아직 비어 있어요')).toBeVisible()

  const s = shot('trip-detail-empty-day')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

test('상세 — 담기 패널은 이미 담긴 곳을 후보에서 뺀다', async ({ page }) => {
  await seedAuthedMap(page, {
    trips: TRIPS,
    events: EVENTS,
    places: PLACES,
    wishes: [
      { id: 'w1', place_id: 'p1', user_id: USER_A, priority: 3, version: 1 },
      { id: 'w2', place_id: 'p2', user_id: USER_A, priority: 2, version: 1 },
    ],
  })
  await page.goto('/trips/t1')
  await page.getByRole('button', { name: /가고싶은 곳에서 담기/ }).click()
  // Day 1에는 p1·p2가 이미 담겨 있으므로 후보가 비어야 한다.
  await expect(page.getByText(/담을 수 있는 가고싶은 곳이 없어요/)).toBeVisible()
})

test('상세 — 다크 모드', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await seedAuthedMap(page, { trips: TRIPS, events: EVENTS, places: PLACES })
  await page.goto('/trips/t1')
  await expect(page.getByRole('heading', { name: '속초 1박2일' })).toBeVisible()
  const s = shot('trip-detail-dark')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})
