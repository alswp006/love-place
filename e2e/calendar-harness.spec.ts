import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { seedAuthedMap, USER_A } from './harness/seed'

// R2 캘린더 비주얼 스모크(Task 16) — 월 칩·일 타임라인·로딩·연결됨-빈 CTA·트랙 범례·피드 카드.
// 픽셀 스냅샷은 OS마다 달라 같은-플랫폼 베이스라인이 있을 때만 비교(map-harness와 동일 가드).
// 기능 assertion(toBeVisible/role)이 1차 게이트, 픽셀은 darwin 베이스라인 한정 보강.

const PARTNER = '00000000-0000-4000-8000-000000000a02'

// 표시 tz가 KST(+09:00) 고정이므로 ISO도 +09:00로 시드 → 같은 날 버킷에 떨어진다(§5.1 day-bucket).
// 회귀 안정성: 미래의 한 고정 날짜(2030-03-15)에 SHARED·PERSONAL(내/상대) 3트랙을 배치.
const D = '2030-03-15'
const EVENTS = [
  {
    id: 'e1', title: '함께 점심', start: `${D}T12:00:00+09:00`, end: `${D}T13:00:00+09:00`,
    is_all_day: false, time_zone: 'Asia/Seoul', visibility: 'SHARED', participants: 'BOTH',
    owner_id: USER_A, place_id: null, memo: null, recurrence_rule: null, reminders: [], version: 1,
  },
  {
    id: 'e2', title: '내 운동', start: `${D}T18:00:00+09:00`, end: `${D}T19:00:00+09:00`,
    is_all_day: false, time_zone: 'Asia/Seoul', visibility: 'PERSONAL', participants: 'OWNER_ONLY',
    owner_id: USER_A, place_id: null, memo: null, recurrence_rule: null, reminders: [], version: 1,
  },
  {
    id: 'e3', title: '상대 미팅', start: `${D}T09:00:00+09:00`, end: `${D}T10:00:00+09:00`,
    is_all_day: false, time_zone: 'Asia/Seoul', visibility: 'PERSONAL', participants: 'OWNER_ONLY',
    owner_id: PARTNER, place_id: null, memo: null, recurrence_rule: null, reminders: [], version: 1,
  },
]

function shot(name: string) {
  const baseline = fileURLToPath(
    new URL(`./calendar-harness.spec.ts-snapshots/${name}-mobile-chromium-${process.platform}.png`, import.meta.url),
  )
  return { skip: !process.env.SEED_SNAPSHOT && !existsSync(baseline), file: `${name}.png` }
}

test('연결됨-빈 — 일정 없을 때 친근한 CTA', async ({ page }) => {
  await seedAuthedMap(page, { events: [] })
  await page.goto(`/calendar?date=${D}`)
  // 연결됨이지만 그 날 일정이 없으면 DayAgenda가 EmptyState + '＋ 일정 추가' CTA를 그린다(§7).
  await expect(page.getByRole('button', { name: '＋ 일정 추가' })).toBeVisible()
  const s = shot('cal-empty')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

test('월 뷰 — 셀 제목 칩(색+심볼) + 트랙 범례', async ({ page }) => {
  await seedAuthedMap(page, { events: EVENTS })
  await page.goto(`/calendar?date=${D}`)
  // 트랙 범례(Task 6) — '함께'·'내 일정' 등 색+이름칩이 항상 보인다.
  await expect(page.getByText('함께', { exact: true })).toBeVisible()
  // 월 셀에 제목 칩이 뜬다(조사 §4) — 비인터랙티브 span이라 텍스트로 확인.
  await expect(page.getByText('함께 점심').first()).toBeVisible()
  const s = shot('cal-month')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

test('일 타임라인 — 시간축 + occurrence 배치', async ({ page }) => {
  await seedAuthedMap(page, { events: EVENTS })
  await page.goto(`/calendar?date=${D}&view=day`)
  // 일 뷰 세그먼트가 눌린 상태(aria-pressed). 타임라인이 occurrence를 시간축에 배치한다(Task 12).
  await expect(page.getByRole('button', { name: '일 뷰' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('함께 점심').first()).toBeVisible()
  const s = shot('cal-day')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

test('주 뷰 — WeekStrip 전환', async ({ page }) => {
  await seedAuthedMap(page, { events: EVENTS })
  await page.goto(`/calendar?date=${D}&view=week`)
  await expect(page.getByRole('button', { name: '주 뷰' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('함께 점심').first()).toBeVisible()
})

test('다크 모드 — 월 뷰', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await seedAuthedMap(page, { events: EVENTS })
  await page.goto(`/calendar?date=${D}`)
  await expect(page.getByText('함께 점심').first()).toBeVisible()
  const s = shot('cal-dark')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

test('다가오는 일정 피드 카드 — 지도 화면에 승격', async ({ page }) => {
  // UpcomingFeed(Task 15) — 지도(/) 상단 다가오는 일정 카드. 윈도우는 now+30일(self-hide)이므로
  // 고정 미래(2030)가 아니라 실행시각 기준 +2일의 이벤트를 시드해 피드에 확실히 들어오게 한다.
  const soon = new Date(Date.now() + 2 * 86400000)
  const soonIso = soon.toISOString().slice(0, 19) // 'YYYY-MM-DDTHH:mm:ss'
  const feedEvent = {
    id: 'ef', title: '다가오는 데이트', start: `${soonIso}+09:00`, end: `${soonIso}+09:00`,
    is_all_day: false, time_zone: 'Asia/Seoul', visibility: 'SHARED', participants: 'BOTH',
    owner_id: USER_A, place_id: null, memo: null, recurrence_rule: null, reminders: [], version: 1,
  }
  await seedAuthedMap(page, { events: [feedEvent] })
  await page.goto('/')
  // 피드 카드 '다가오는 일정' 섹션 + 이벤트 제목. self-hide(없으면 미표시)이므로 시드로 보장.
  // 라벨이 실행시각 기준 카운트다운(D-2/N분 뒤)이라 픽셀 스냅샷은 비결정적 → 기능 assertion만 둔다.
  await expect(page.getByRole('region', { name: '다가오는 일정' })).toBeVisible()
  await expect(page.getByText('다가오는 데이트')).toBeVisible()
})
