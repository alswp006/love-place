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

test('연결됨-빈 — 일정이 없어도 한 줄 입력이 남는다', async ({ page }) => {
  await seedAuthedMap(page, { events: [] })
  await page.goto(`/calendar?date=${D}`)
  // 빈 상태 카드와 '＋ 일정 추가'는 걷어냈다 — 바로 위 한 줄 입력이 이미 같은 행동을 권하고 있어
  // 화면만 길어졌다. 대신 그 입력칸이 항상 있어야 죽은 화면이 되지 않는다(§7).
  await expect(page.getByRole('button', { name: '＋ 일정 추가' })).toHaveCount(0)
  await expect(page.getByPlaceholder(/할 일/)).toBeVisible()
  const s = shot('cal-empty')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

test('월 뷰 — 셀 제목 칩(색+심볼) + 트랙 전환', async ({ page }) => {
  await seedAuthedMap(page, { events: EVENTS })
  await page.goto(`/calendar?date=${D}`)
  // 별도 범례는 없앴다 — 트랙 전환 자체가 색+심볼+이름을 보여주므로 중복이었다.
  // 셋 중 하나만 보는 단일 선택이고 기본은 '함께'(§1 공유가 기본값).
  const switcher = page.getByRole('group', { name: '어느 캘린더를 볼지' })
  await expect(switcher.getByRole('button', { name: /함께/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(switcher.getByRole('button', { name: /나/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  // 월 셀에 제목 칩이 뜬다(조사 §4) — 비인터랙티브 span이라 텍스트로 확인.
  await expect(page.getByText('함께 점심').first()).toBeVisible()
  // 트랙을 '나'로 바꾸면 함께 일정은 사라지고 내 일정만 남는다(캘린더 분리).
  await switcher.getByRole('button', { name: /나/ }).click()
  await expect(page.getByText('내 운동').first()).toBeVisible()
  await expect(page.getByText('함께 점심')).toHaveCount(0)
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

test('상세 — 메모칸 없음 + ⋯로 카테고리·반복 펼치기', async ({ page }) => {
  await seedAuthedMap(page, { events: EVENTS })
  await page.goto(`/calendar?date=${D}`)
  // 아젠다 항목을 눌러 상세 시트를 연다(한 줄 추가로 만든 일정도 같은 경로로 열린다).
  await page.getByRole('button', { name: /함께 점심/ }).first().click()
  const sheet = page.getByRole('dialog', { name: '일정 수정' })
  await expect(sheet).toBeVisible()

  // 메모칸은 없앴다 — 일정 얘기는 댓글로.
  await expect(sheet.getByLabel('메모', { exact: true })).toHaveCount(0)

  // 카테고리·반복은 접혀 있다가 ⋯로 펼쳐진다.
  const more = sheet.getByRole('button', { name: '카테고리·반복 설정' })
  await expect(more).toHaveAttribute('aria-expanded', 'false')
  // getByLabel은 부분 일치 — '카테고리·반복 설정'(⋯ 버튼)까지 잡히므로 exact로 좁힌다.
  await expect(sheet.getByLabel('반복', { exact: true })).toHaveCount(0)
  await more.click()
  await expect(more).toHaveAttribute('aria-expanded', 'true')
  await expect(sheet.getByLabel('반복', { exact: true })).toBeVisible()
  await expect(sheet.getByText('카테고리', { exact: true })).toBeVisible()
  // 카테고리가 없어도 죽은 화면을 두지 않는다(§7 빈 상태).
  await expect(sheet.getByText('아직 카테고리가 없어요. 하나 만들어 보세요.')).toBeVisible()
})

test('한 줄 추가 — 캘린더 아래 빈 줄이 항상 있다', async ({ page }) => {
  await seedAuthedMap(page, { events: EVENTS })
  await page.goto(`/calendar?date=${D}`)
  // 투두메이트식 상시 입력줄 — 일정이 있든 없든 날짜 바로 아래에 있다.
  await expect(page.getByRole('form', { name: '빠른 일정 추가' })).toBeVisible()
  await expect(page.getByPlaceholder('할 일 입력')).toBeVisible()

  // 쉬는 상태에선 '추가' 버튼을 렌더하지 않는다(문구 최소화). 글자를 넣으면 나타난다 —
  // 엔터 말고 버튼 경로도 살아 있어야 한다(ux §1).
  await expect(page.getByRole('button', { name: '추가', exact: true })).toHaveCount(0)
  await page.getByPlaceholder('할 일 입력').fill('짐 싸기')
  await expect(page.getByRole('button', { name: '추가', exact: true })).toBeVisible()

  // 플로팅 +(FAB)는 없앴다 — 상시 입력줄과 중복이고 입력줄을 덮던 원인이었다.
  await expect(page.getByRole('button', { name: '일정 추가' })).toHaveCount(0)
})

test('카테고리 — 전체가 기본, 고르면 그 분류만 남는다', async ({ page }) => {
  const CATS = [
    { id: 'k1', name: '운동', color: '#4fb58a', sort_order: 0, version: 1 },
    { id: 'k2', name: '업무', color: '#6e8ac8', sort_order: 1, version: 1 },
  ]
  const withCat = [
    { ...EVENTS[1]!, category_id: 'k1' }, // 내 운동
    { ...EVENTS[0]!, category_id: 'k2' }, // 함께 점심
  ]
  await seedAuthedMap(page, { events: withCat, eventCategories: CATS })
  await page.goto(`/calendar?date=${D}`)
  await page.getByRole('group', { name: '어느 캘린더를 볼지' }).getByRole('button', { name: /나/ }).click()

  const cats = page.getByRole('group', { name: '카테고리' })
  // 기본은 '전체' — 거르지 않는다.
  await expect(cats.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true')
  // 월 셀 버튼도 제목을 접근 이름에 담고, 아젠다 행에는 항목/삭제 버튼이 둘 다 있다 → 영역 + 텍스트로 좁힌다.
  const agenda = page.getByRole('region', { name: `${D} 일정` })
  await expect(agenda.getByText('내 운동')).toHaveCount(1)

  // '업무'를 고르면 그 분류가 아닌 '내 운동'은 목록에서 빠진다.
  await cats.getByRole('button', { name: /업무/ }).click()
  await expect(agenda.getByText('내 운동')).toHaveCount(0)
  // 분류를 걸러 비어도 입력칸은 그대로 — 그 분류로 바로 적을 수 있다.
  await expect(page.getByPlaceholder(/할 일/)).toBeVisible()

  // '전체'로 돌아오면 다시 보인다.
  await cats.getByRole('button', { name: '전체' }).click()
  await expect(agenda.getByText('내 운동')).toHaveCount(1)
})

test('한 줄 추가는 지금 보고 있는 캘린더로 들어간다(함께=SHARED / 나=PERSONAL)', async ({ page }) => {
  await seedAuthedMap(page, { events: EVENTS })
  // 생성 POST 본문을 가로채 실제로 나가는 visibility를 본다(페이지→컴포넌트 배선 회귀).
  const posted: Record<string, unknown>[] = []
  await page.route('**/e2e.supabase.co/rest/v1/events**', async (route) => {
    if (route.request().method() === 'POST') {
      posted.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>)
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EVENTS) })
  })
  await page.goto(`/calendar?date=${D}`)

  const switcher = page.getByRole('group', { name: '어느 캘린더를 볼지' })
  // 기본은 '함께' — 여기서 적으면 함께 일정이어야 한다(내 일정이 되면 안 된다).
  await expect(switcher.getByRole('button', { name: /함께/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByPlaceholder('할 일 입력').fill('같이 장보기')
  await page.getByRole('button', { name: '추가', exact: true }).click()
  await expect.poll(() => posted.length).toBe(1)
  expect(posted[0]!.visibility).toBe('SHARED')
  expect(posted[0]!.is_all_day).toBe(true)

  // '나'로 바꾸면 내 일정으로 들어간다.
  await switcher.getByRole('button', { name: /나/ }).click()
  await page.getByPlaceholder('할 일 입력').fill('스쿼트')
  await page.getByRole('button', { name: '추가', exact: true }).click()
  await expect.poll(() => posted.length).toBe(2)
  expect(posted[1]!.visibility).toBe('PERSONAL')
})

test('상대 캘린더는 보기 전용 — 추가 경로가 아예 없다', async ({ page }) => {
  await seedAuthedMap(page, { events: EVENTS })
  await page.goto(`/calendar?date=${D}`)
  const switcher = page.getByRole('group', { name: '어느 캘린더를 볼지' })
  await switcher.getByRole('button', { name: /상대/ }).click()

  // 상대 트랙에서 적으면 내 PERSONAL 일정이 만들어져 오해를 부른다 → 입력줄 자체를 없앤다.
  await expect(page.getByRole('form', { name: '빠른 일정 추가' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '＋ 일정 추가' })).toHaveCount(0)
  // 상대 일정은 그대로 보인다(숨김이 아니라 보기 전용).
  await expect(page.getByText('상대 미팅').first()).toBeVisible()

  // 내 트랙으로 돌아오면 입력줄이 다시 나온다.
  await switcher.getByRole('button', { name: /나/ }).click()
  await expect(page.getByRole('form', { name: '빠른 일정 추가' })).toBeVisible()
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
  // 알림은 이제 한 줄로 접혀 있다 — 지도 탭의 주인공은 지도라서 첫 화면을 카드로 덮지 않는다.
  // 접힌 줄에서도 '무슨 일이 다가오는지'는 읽혀야 한다(신호를 없앤 게 아니라 자리만 돌려준 것).
  const pill = page.getByRole('button', { name: /알림 .*펼치기/ })
  await expect(pill).toBeVisible()
  await expect(pill).toContainText('다가오는 데이트')
  // 탭하면 원래 카드가 그대로 펼쳐진다.
  await pill.click()
  await expect(page.getByRole('region', { name: '다가오는 일정' })).toBeVisible()
  await expect(page.getByText('다가오는 데이트')).toBeVisible()
})

test('완료 체크 — 회차 단위로 기록되고 여정이 한 걸음 나아간다', async ({ page }) => {
  const D = '2030-03-15'
  const ev = {
    id: 'ed1', title: '아침 운동',
    start: `${D}T07:00:00+09:00`, end: `${D}T08:00:00+09:00`,
    is_all_day: false, time_zone: 'Asia/Seoul', visibility: 'SHARED', participants: 'BOTH',
    owner_id: USER_A, place_id: null, memo: null, recurrence_rule: null, reminders: [], version: 1,
    category_id: null,
  }
  await seedAuthedMap(page, { events: [ev] })
  // 체크 POST 본문을 가로채 실제로 나가는 값을 본다(페이지→컴포넌트 배선 회귀).
  const posted: Record<string, unknown>[] = []
  await page.route('**/e2e.supabase.co/rest/v1/event_completions**', async (route) => {
    if (route.request().method() === 'POST') {
      posted.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>)
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.goto(`/calendar?date=${D}`)

  const box = page.getByRole('checkbox', { name: /아침 운동 완료/ })
  await expect(box).toHaveAttribute('aria-checked', 'false')
  // 터치 타깃(ux §1).
  expect((await box.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await box.click()

  await expect.poll(() => posted.length).toBe(1)
  // occurrence_start는 그 회차의 시작이어야 한다 — 반복 일정에서 전체가 완료되는 것을 막는 핵심.
  expect(posted[0]).toMatchObject({
    event_id: 'ed1',
    occurrence_start: `${D}T07:00:00+09:00`,
    created_by: USER_A,
  })
})

test('별자리 스트립 — 기본은 한 줄, 펼치면 이번 주 별자리와 지난 주들', async ({ page }) => {
  await seedAuthedMap(page, { events: [] })
  await page.goto('/calendar')

  // 캘린더 자리를 뺏지 않게 접혀 있다(지도 알림과 같은 규약).
  const pill = page.getByRole('button', { name: /별자리 펼치기/ })
  await expect(pill).toBeVisible()
  expect((await pill.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect(page.getByRole('region', { name: '우리가 만든 별자리' })).toHaveCount(0)

  await pill.click()
  await expect(page.getByRole('region', { name: '우리가 만든 별자리' })).toBeVisible()
  // 그림만으로 말하지 않는다(§8) — 안내문과 범례가 글자로 함께 있다.
  await expect(page.getByText('일정을 체크하면 별이 하나씩 떠요')).toBeVisible()
  await expect(page.getByRole('img', { name: /이번 주 별/ })).toBeVisible()
  await expect(page.getByText('지난 주들')).toBeVisible()
})
