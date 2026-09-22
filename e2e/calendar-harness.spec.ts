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

// ── 혼자 쓰기(0024) — '상대'가 없을 때 죽은 UI를 남기지 않는다 ──
test('혼자면 트랙 전환기가 없다 — 고를 것이 없는 선택지는 잡음이다', async ({ page }) => {
  await seedAuthedMap(page, { solo: true, events: EVENTS })
  await page.goto(`/calendar?date=${D}`)
  await expect(page.getByRole('group', { name: '어느 캘린더를 볼지' })).toHaveCount(0)
  // 그래도 일정은 다 보인다 — 거르지 않는다(트랙은 '누구 것'인데 나눌 상대가 없다).
  await expect(page.getByText('함께 점심').first()).toBeVisible()
  await expect(page.getByText('내 운동').first()).toBeVisible()
  // 추가 경로는 살아 있다(보기 전용이 아니다).
  await expect(page.getByRole('form', { name: '빠른 일정 추가' })).toBeVisible()
})

test('혼자면 별자리 분모가 절반 — 다 채워도 미완성이 되지 않는다', async ({ page }) => {
  await seedAuthedMap(page, { solo: true, events: [] })
  await page.goto('/calendar')
  await page.getByRole('button', { name: /별자리 펼치기/ }).click()
  const region = page.getByRole('region', { name: '우리가 만든 별자리' })
  await expect(region).toBeVisible()

  // 분모 = 그 달의 날 수 × 1. 둘일 때는 × 2다(아래 케이스와 대조).
  const progress = await page.getByText(/\d+\/\d+ · \d+개 남음/).textContent()
  const need = Number(/\d+\/(\d+)/.exec(progress ?? '')?.[1])
  const days = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  expect(need).toBe(days)

  // 범례의 '상대' 점은 혼자일 때 영원히 안 채워지는 빈 약속이라 뺀다.
  await expect(region.getByText('상대', { exact: true })).toHaveCount(0)
})

test('둘이면 별자리 분모가 날 수 × 2 — 같이 하니 더 채운다', async ({ page }) => {
  await seedAuthedMap(page, { events: [] })
  await page.goto('/calendar')
  await page.getByRole('button', { name: /별자리 펼치기/ }).click()
  const progress = await page.getByText(/\d+\/\d+ · \d+개 남음/).textContent()
  const need = Number(/\d+\/(\d+)/.exec(progress ?? '')?.[1])
  const days = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  expect(need).toBe(days * 2)
  await expect(page.getByRole('region', { name: '우리가 만든 별자리' }).getByText('상대', { exact: true })).toBeVisible()
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

test('별자리 스트립 — 기본은 한 줄, 펼치면 이번 달 별자리와 지난 달들', async ({ page }) => {
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
  // 진행도는 숫자로 읽힌다(§8) — 그림만으로 말하지 않는다.
  await expect(page.getByText(/\d+\/\d+ · \d+개 남음/)).toBeVisible()
  await expect(page.getByRole('img', { name: /이번 달 .*별 \d+개/ })).toBeVisible()
  // 올해 열두 달이 전부 미니 별자리로 — 지나온 달만 두면 몇 개 남았는지가 안 보인다.
  const yearRow = page.getByLabel('올해 열두 달')
  await expect(yearRow.getByRole('img')).toHaveCount(12)

  // 접기는 우상단 — 하단 전폭 버튼이면 카드가 그만큼 길어진다. 터치 타깃은 44px 유지(ux §1).
  const card = page.getByRole('region', { name: '우리가 만든 별자리' })
  const cardBox = (await card.boundingBox())!
  const close = page.getByRole('button', { name: '별자리 접기' })
  const closeBox = (await close.boundingBox())!
  expect(closeBox.height).toBeGreaterThanOrEqual(44)
  expect(closeBox.x).toBeGreaterThan(cardBox.x + cardBox.width * 0.7)
  expect(closeBox.y).toBeLessThan(cardBox.y + 60)
  // 캘린더를 밀어내지 않게 카드 높이를 묶어둔다.
  expect(cardBox.height).toBeLessThan(360)

  await close.click()
  await expect(page.getByRole('region', { name: '우리가 만든 별자리' })).toHaveCount(0)
})

// ── 공휴일 (2026-09) ────────────────────────────────────────────────────────
//
// Flutter 앱에만 있던 것을 웹에도 옮겼다. 두 앱이 같은 달력을 보여줘야 한다.
// 기대값의 정본은 `src/__tests__/holidays.test.ts`이고, 여기서는 **실제로 화면에 나오는지**만 본다.

test('공휴일 — 이름이 날짜 옆에 뜨고, 원래 날과 대체일이 갈린다', async ({ page }) => {
  await seedAuthedMap(page, { events: [] })
  // 2026-10: 3일(토) 개천절, 5일(월) 대체공휴일, 9일(금) 한글날.
  await page.goto('/calendar?date=2026-10-03')

  // 원래 날에도 이름이 남는다 — 안 그러면 10/3이 아무 날도 아닌 것처럼 보인다.
  await expect(page.getByText('개천절', { exact: true }).first()).toBeVisible()
  // 옮겨 쉬는 날은 '개천절 대체'가 아니라 '대체공휴일'이라고만 적는다.
  await expect(page.getByText('대체공휴일', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('한글날', { exact: true }).first()).toBeVisible()
})

test('공휴일 — 색만으로 구분하지 않는다(§8): 셀 이름표에 공휴일이 들어간다', async ({ page }) => {
  await seedAuthedMap(page, { events: [] })
  await page.goto('/calendar?date=2026-10-03')
  // 스크린리더는 빨간 숫자를 읽지 못한다. 이름표에 들어가야 '쉬는 날'이 전달된다.
  await expect(page.getByRole('button', { name: /2026-10-05 · 대체공휴일/ })).toBeVisible()
})

// ── 주를 가로지르는 막대 (2026-09) ─────────────────────────────────────────
//
// 여행과 여러 날 일정은 칸마다 조각이 아니라 **막대 하나**로 그린다.
// 조각으로 그리면 '부산여행'이 칸 너비에서 '부산여'로 잘리고, 이어진 칸은 이름 없는 막대가 된다.

const TRIP = [
  {
    id: 'tr1', title: '부산여행', start_date: '2026-10-07', end_date: '2026-10-09',
    region_code: null, version: 1,
  },
]

test('여행 — 그 자체가 달력에 막대로 뜬다(이벤트를 만들지 않고)', async ({ page }) => {
  await seedAuthedMap(page, { events: [], trips: TRIP })
  await page.goto('/calendar?date=2026-10-07')

  // 사흘이지만 이름은 **한 번**만 나온다. 칸마다 조각이면 세 번 나온다.
  const bar = page.locator('[class*="barTrip"]')
  await expect(bar).toHaveCount(1)
  await expect(bar).toContainText('부산여행')

  // 그리고 세 칸을 가로지른다 — 한 칸 너비에 갇히면 제목이 잘린다.
  const barBox = await bar.boundingBox()
  const cellBox = await page.getByRole('button', { name: /^2026-10-07/ }).boundingBox()
  expect(barBox!.width).toBeGreaterThan(cellBox!.width * 2)
})

test('여러 날 일정 — 막대로 나오고 칸 안에 또 그리지 않는다', async ({ page }) => {
  await seedAuthedMap(page, {
    events: [
      {
        id: 'ev-span', title: '워크숍', start: '2026-10-07T00:00:00+09:00', end: '2026-10-09T23:59:59+09:00',
        is_all_day: true, time_zone: 'Asia/Seoul', visibility: 'SHARED', participants: 'BOTH',
        owner_id: USER_A, place_id: null, memo: null, recurrence_rule: null, reminders: [], version: 1,
      },
    ],
  })
  await page.goto('/calendar?date=2026-10-07')
  // 격자 **안에서만** 센다 — 아래 아젠다에도 같은 일정이 나오는 건 정상이다.
  const grid = page.locator('[class*="monthGrid"]')
  // 같은 일정이 막대로도, 칸 칩으로도 나오면 격자 안에 두 번 보인다.
  await expect(grid.getByText('워크숍', { exact: false })).toHaveCount(1)
})

test('하루짜리 반복은 이어지지 않는다 — 매일 반복이 통째로 막대가 되면 안 된다', async ({ page }) => {
  await seedAuthedMap(page, {
    events: [
      {
        id: 'ev-daily', title: '아침운동', start: '2026-10-05T07:00:00+09:00', end: '2026-10-05T08:00:00+09:00',
        is_all_day: false, time_zone: 'Asia/Seoul', visibility: 'SHARED', participants: 'BOTH',
        owner_id: USER_A, place_id: null, memo: null,
        recurrence_rule: 'FREQ=DAILY;INTERVAL=1;COUNT=5', reminders: [], version: 1,
      },
    ],
  })
  await page.goto('/calendar?date=2026-10-05')
  const grid = page.locator('[class*="monthGrid"]')
  // 막대가 하나도 없어야 한다. 회차마다 시작·끝이 같은 날이므로.
  await expect(grid.locator('[class*="bar"]')).toHaveCount(0)
  // 대신 칸 안의 칩으로 다섯 번 나온다(10/5~10/9).
  await expect(grid.getByText('아침운동', { exact: false })).toHaveCount(5)
})

// ── 분류색 할 일 블록 (2026-09) ────────────────────────────────────────────
//
// 안 한 일은 **테두리만**, 한 일은 그 색으로 **채운다**. 예전처럼 작대기(취소선)로
// 완료를 말하면 눈에 잘 안 들어온다. 색만으로 말하지 않는다(§8) — 형태가 1차 신호다.

const CAT = [{ id: 'cat-mint', name: '운동', color: '#4fb58a', sort_order: 0, version: 1 }]

const BLOCK_EVENTS = [
  {
    id: 'ev-todo', title: '달리기', start: '2026-10-12T07:00:00+09:00', end: '2026-10-12T08:00:00+09:00',
    is_all_day: false, time_zone: 'Asia/Seoul', visibility: 'SHARED', participants: 'BOTH',
    owner_id: USER_A, place_id: null, memo: null, recurrence_rule: null, reminders: [],
    category_id: 'cat-mint', version: 1,
  },
  {
    id: 'ev-done', title: '요가', start: '2026-10-13T07:00:00+09:00', end: '2026-10-13T08:00:00+09:00',
    is_all_day: false, time_zone: 'Asia/Seoul', visibility: 'SHARED', participants: 'BOTH',
    owner_id: USER_A, place_id: null, memo: null, recurrence_rule: null, reminders: [],
    category_id: 'cat-mint', version: 1,
  },
]

test('할 일 블록 — 안 한 일은 테두리, 한 일은 채움', async ({ page }) => {
  await seedAuthedMap(page, {
    events: BLOCK_EVENTS,
    eventCategories: CAT,
    eventCompletions: [
      {
        id: 'done1', event_id: 'ev-done', occurrence_start: '2026-10-12T22:00:00.000Z',
        // done_at은 잔디(별자리)가 '언제 한 건지'로 쓴다 — 빼면 그 화면이 날짜를 못 만든다.
        done_at: '2026-10-13T08:30:00+09:00', created_by: USER_A, version: 1,
      },
    ],
  })
  await page.goto('/calendar?date=2026-10-12')

  // 칸 버튼 **안**의 블록만 고른다. `[class*="cellChip"]`만 쓰면 컨테이너(`cellChips`)도
  // 함께 잡히고, 그 핸들은 리렌더 중 떨어져 빈 스타일을 돌려준다(실제로 그랬다).
  // 스타일 단언은 재시도되는 toHaveCSS로 — evaluate는 한 번 읽고 끝이라 같은 함정에 빠진다.
  const chip = (day: string) =>
    page.getByRole('button', { name: new RegExp(`^${day}`) }).locator('[class*="cellChip_"]')

  const todo = chip('2026-10-12')
  const done = chip('2026-10-13')

  // 안 한 일: 면이 비어 있다(테두리와 글자만 분류 색).
  await expect(todo).toHaveCSS('background-color', 'rgb(0, 0, 0, 0)'.replace('rgb', 'rgba'))

  // 한 일: 면이 채워진다. **민트 원색 그대로는 아니다** — todoBlockColors가 그 위의
  // 글자가 AA(4.5:1)를 넘도록 면을 조금 움직인다(색의 정확한 값은 단위 테스트가 못 박는다).
  // 여기서 볼 것은 '채워졌는가'와 '고른 분류의 색조인가'뿐이다.
  const doneBg = await done.evaluate((el) => getComputedStyle(el).backgroundColor)
  const rgb = doneBg.match(/\d+/g)!.map(Number) as [number, number, number]
  expect(doneBg).not.toBe('rgba(0, 0, 0, 0)')
  // 민트 계열: 초록이 가장 세고 빨강이 가장 약하다.
  expect(rgb[1]).toBeGreaterThan(rgb[2])
  expect(rgb[2]).toBeGreaterThan(rgb[0])

  // 색만으로 말하지 않는다(§8) — 완료엔 체크 글리프가 함께 붙는다.
  await expect(done).toContainText('✓')
  await expect(todo).not.toContainText('✓')
})

test('할 일 블록 — 분류가 없어도 그려진다(브랜드 핑크가 아닌 색으로)', async ({ page }) => {
  await seedAuthedMap(page, {
    events: [{ ...BLOCK_EVENTS[0]!, id: 'ev-nocat', title: '산책', category_id: null }],
  })
  await page.goto('/calendar?date=2026-10-12')
  const chip = page
    .getByRole('button', { name: /^2026-10-12/ })
    .locator('[class*="cellChip_"]')
  await expect(chip).toContainText('산책')
  // 분류 없음이 상대 트랙 색(브랜드 핑크)으로 읽히면 안 된다.
  await expect(chip).not.toHaveCSS('color', 'rgb(226, 99, 138)')
})
