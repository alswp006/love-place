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

  // Day는 이제 전환이 아니라 이어진 흐름 — 상단 바는 점프 앵커, 아래에 Day 섹션이 전부 있다.
  const nav = page.getByRole('navigation', { name: '날짜로 이동' })
  await expect(nav.getByText('Day 1')).toBeVisible()
  await expect(nav.getByText('Day 2')).toBeVisible()

  const day1 = page.getByRole('region', { name: /Day 1/ })
  await expect(day1.getByText('칠성조선소')).toBeVisible()
  await expect(day1.getByText('09:00')).toBeVisible()

  // 비어 있는 Day도 죽은 화면이 아니다(§7) — 같은 화면에서 바로 보인다.
  const day2 = page.getByRole('region', { name: /Day 2/ })
  await expect(day2.getByText(/아직 비어 있어요/)).toBeVisible()

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
  // 추가 경로가 Day마다 생겼다 — Day 1에서 연다.
  const d1 = page.getByRole('region', { name: /Day 1/ })
  await d1.getByRole('button', { name: '장소 추가' }).click()
  // Day 1에는 p1·p2가 이미 담겨 있으므로 후보가 비어야 한다.
  await expect(d1.getByText(/담을 수 있는 가고싶은 곳이 없어요/)).toBeVisible()
})

test('상세 — 거리 칩 + 그날 동선 미니 지도', async ({ page }) => {
  await seedAuthedMap(page, {
    trips: TRIPS,
    events: EVENTS,
    places: PLACES,
    // 스톱 2곳 → 구간 1개. 도로 거리 1.24km.
    directionLegs: [
      {
        polyline: [
          { lat: 38.2, lng: 128.59 },
          { lat: 38.205, lng: 128.595 },
          { lat: 38.21, lng: 128.6 },
        ],
        distanceMeters: 1240,
        degraded: false,
      },
    ],
  })
  await page.goto('/trips/t1')
  // 거리 + 길찾기를 텍스트로(색만 의존 금지 §8). 탭 타깃은 44px 이상.
  const chip = page.getByRole('button', { name: /칠성조선소에서 영금정까지 1\.2km/ })
  await expect(chip).toBeVisible()
  expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  // 미니 지도(네이버 스텁)가 그려진다.
  await expect(page.getByLabel('장소 지도')).toBeVisible()

  const s = shot('trip-detail-legs')
  test.skip(s.skip, `베이스라인 없음(${process.platform})`)
  await expect(page).toHaveScreenshot(s.file, { fullPage: true, maxDiffPixelRatio: 0.02 })
})

test('상세 — 길찾기 프록시가 죽어도 목록은 그대로(칩만 사라짐)', async ({ page }) => {
  // directionLegs 미시드 → 프록시 500. 칩은 없지만 스톱·Day는 정상 렌더돼야 한다.
  await seedAuthedMap(page, { trips: TRIPS, events: EVENTS, places: PLACES })
  await page.goto('/trips/t1')
  await expect(page.getByText('칠성조선소')).toBeVisible()
  await expect(page.getByText('영금정')).toBeVisible()
  await expect(page.getByText(/길찾기/)).toHaveCount(0)
})

test('목록 — 만들기 FAB + 지난 여행 섹션', async ({ page }) => {
  await seedAuthedMap(page, { trips: TRIPS, events: EVENTS })
  await page.goto('/trips')

  // 만들기는 설명 카드가 아니라 우하단 + 하나. 여행 탭에 들어온 사람은 이미 뭘 하러 왔는지 안다.
  await expect(page.getByRole('button', { name: /여행 일정 만들기/ })).toHaveCount(0)
  const cta = page.getByRole('button', { name: '여행 만들기' })
  await expect(cta).toBeVisible()
  const box = (await cta.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  // 우하단 — 엄지 도달 영역(ux §1).
  expect(box.x).toBeGreaterThan(page.viewportSize()!.width * 0.6)

  // 예정과 지난 것을 섞지 않는다 — 경계에 섹션 제목이 선다.
  await expect(page.getByRole('heading', { name: '지난 여행' })).toBeVisible()

  // 카드 상태 칩은 계속 색이 아니라 텍스트로 말한다(§8).
  await expect(page.getByText(/^D-\d+$/)).toBeVisible()
  await expect(page.getByText(/일 전$/)).toBeVisible()
})

test('상세 — 스톱이 세로 레일 위에 놓이고 구간 칩이 레일에 걸친다', async ({ page }) => {
  await seedAuthedMap(page, {
    trips: TRIPS,
    events: EVENTS,
    places: PLACES,
    directionLegs: [
      { polyline: [{ lat: 38.2, lng: 128.59 }, { lat: 38.21, lng: 128.6 }], distanceMeters: 1240, degraded: false },
    ],
  })
  await page.goto('/trips/t1')

  // 번호 배지는 카드 '밖'(레일)에 있다 — 카드 안에 있으면 순서 축이 안 읽힌다.
  const first = page.getByRole('listitem').first()
  const badge = first.locator('css=:scope > span').first()
  await expect(badge).toHaveText('1')

  // 구간 칩은 전폭 버튼이 아니라 레일에 걸친 알약 — 카드보다 왼쪽에서 시작한다.
  const chip = page.getByRole('button', { name: /칠성조선소에서 영금정까지/ })
  const chipBox = (await chip.boundingBox())!
  const cardBox = (await first.locator('css=:scope > div').first().boundingBox())!
  expect(chipBox.x).toBeLessThan(cardBox.x)
  // 터치 타깃은 유지(ux §1).
  expect(chipBox.height).toBeGreaterThanOrEqual(44)
})

test('상세 — 장소 없는 일정은 그 날 메모로 뜨고, 누가 담았는지 보인다', async ({ page }) => {
  const USER_B = '00000000-0000-4000-8000-000000000a02'
  await seedAuthedMap(page, {
    trips: TRIPS,
    places: PLACES,
    profiles: [
      { id: USER_A, display_name: '나', color: '#3b6db5', avatar_url: null, version: 1 },
      { id: USER_B, display_name: '지민', color: '#e0568a', avatar_url: null, version: 1 },
    ],
    events: [
      ...EVENTS,
      {
        id: 'm1', title: '멀미약 챙기기',
        start: `${FUTURE_START}T00:00:00+09:00`, end: `${FUTURE_START}T23:59:00+09:00`,
        is_all_day: true, time_zone: 'Asia/Seoul', visibility: 'PERSONAL', participants: 'ME',
        owner_id: USER_B, place_id: null, memo: null, recurrence_rule: null, reminders: [], version: 1,
      },
    ],
  })
  await page.goto('/trips/t1')
  const day1 = page.getByRole('region', { name: /Day 1/ })

  // 장소 없는 일정 = 그 날 챙길 것. 스톱 순서를 흐리지 않게 번호 대신 점으로 붙는다.
  await expect(day1.getByText('멀미약 챙기기')).toBeVisible()
  // 각자의 메모 — 누가 남겼는지 아바타 + 트랙이 색 아닌 라벨로 말한다(§8).
  await expect(day1.getByLabel('지민 메모')).toBeVisible()
  await expect(day1.getByText(/상대/)).toBeVisible()
  // 스톱에도 출처가 붙는다(누가 담았는지).
  await expect(day1.getByLabel('나 담음')).toHaveCount(2)

  // 메모 추가 경로도 Day 안에 있다.
  await day1.getByRole('button', { name: '메모 추가' }).click()
  await expect(day1.getByLabel(/메모 입력/)).toBeVisible()
})

test('상세 — 지난 날의 스톱에 리뷰를 남긴다(각자 자기 별점·한 줄)', async ({ page }) => {
  const USER_B = '00000000-0000-4000-8000-000000000a02'
  const PAST = '2020-05-01'
  const pastTrip = [{ id: 't3', title: '지난 속초', start_date: PAST, end_date: PAST, region_code: null, version: 1 }]
  const pastEvents = [{
    id: 'pe1', title: '칠성조선소',
    start: `${PAST}T09:00:00+09:00`, end: `${PAST}T10:00:00+09:00`,
    is_all_day: false, time_zone: 'Asia/Seoul', visibility: 'SHARED', participants: 'BOTH',
    owner_id: USER_A, place_id: 'p1', memo: null, recurrence_rule: null, reminders: [], version: 1,
  }]
  await seedAuthedMap(page, {
    trips: pastTrip,
    places: PLACES,
    events: pastEvents,
    profiles: [
      { id: USER_A, display_name: '나', color: '#3b6db5', avatar_url: null, version: 1 },
      { id: USER_B, display_name: '지민', color: '#e0568a', avatar_url: null, version: 1 },
    ],
    // 상대가 이미 남긴 리뷰 — 내 칸과 별개 행이다(visits에 유니크 제약 없음).
    visits: [{
      id: 'v2', place_id: 'p1', trip_id: 't3', visit_date: PAST,
      rating: 5, memo: '또 가고 싶다', version: 1, created_by: USER_B,
    }],
  })
  // 저장 POST 본문을 가로채 실제로 나가는 값을 본다(페이지→컴포넌트 배선 회귀).
  const posted: Record<string, unknown>[] = []
  await page.route('**/e2e.supabase.co/rest/v1/visits**', async (route) => {
    if (route.request().method() === 'POST') {
      posted.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>)
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    // 저장 전 '내 방문행 찾기' 조회 — 스텁이 필터를 무시하면 상대 행을 내 것으로 잘못 집어
    // insert 대신 update로 새기 때문에, created_by 필터만은 실제로 지켜준다.
    const url = route.request().url()
    const rows = url.includes(`created_by=eq.${USER_A}`)
      ? []
      : [{ id: 'v2', place_id: 'p1', trip_id: 't3', visit_date: PAST, rating: 5, memo: '또 가고 싶다', version: 1, created_by: USER_B }]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) })
  })
  await page.goto('/trips/t3')

  // 상대 리뷰는 읽기 전용으로 먼저 보인다 — 별점은 숫자로도 말한다(§8).
  await expect(page.getByText('또 가고 싶다')).toBeVisible()
  await expect(page.getByText('5/5')).toBeVisible()

  const cta = page.getByRole('button', { name: /리뷰 남기기/ })
  expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await cta.click()
  await page.getByRole('radio', { name: '5점 중 4점' }).click()
  await page.getByLabel(/리뷰 한 줄/).fill('커피가 좋았다')
  await page.getByRole('button', { name: '저장' }).click()

  await expect.poll(() => posted.length).toBe(1)
  expect(posted[0]).toMatchObject({ place_id: 'p1', trip_id: 't3', rating: 4, memo: '커피가 좋았다', created_by: USER_A })
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

test('사진 — 여행 카드에 커버, 없으면 커버 자리 없음', async ({ page }) => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  )
  await seedAuthedMap(page, {
    trips: TRIPS,
    photos: [
      {
        id: 'ph1', storage_url: 'c1/ph1.webp', thumbnail_url: 'c1/ph1_t.webp',
        place_id: null, trip_id: 't1', taken_at: null, caption: null,
        uploaded_by: USER_A, version: 1,
      },
    ],
  })
  await page.route('**/e2e.supabase.co/storage/v1/object/sign/photos**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ error: null, path: 'c1/ph1_t.webp', signedURL: '/e2e-photo.png' }]),
    }),
  )
  await page.route('**/e2e-photo.png', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: png }),
  )
  await page.goto('/trips')

  // t1은 커버가 있고 t2는 없다 — 없는 쪽에 회색 자리표시가 생기면 안 된다(§7).
  const withCover = page.getByRole('link', { name: /속초 1박2일 여행 상세 열기/ })
  const without = page.getByRole('link', { name: /지난 제주 여행 상세 열기/ })
  await expect(withCover.locator('img')).toHaveCount(1)
  await expect(without.locator('img')).toHaveCount(0)
})
