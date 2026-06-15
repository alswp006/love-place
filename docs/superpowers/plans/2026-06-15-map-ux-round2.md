# Map UX Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 3-band bottom layout (sheet vs tab bar), replace on-map InfoWindow with React sheet detail, fix sync integrity (versioned un-react, conflicted un-visit, offline queue) and my-location/search/contrast issues, all gated by a Playwright visual harness.

**Architecture:** MapPage stays the single orchestrator: it owns `selectedId`/`previewHit` and threads them into a re-anchored `PlaceSheet` that hosts new React `PlaceDetail`/`PlacePreviewDetail` components; `NaverMap` becomes pure-visual (markers, self-dot, accuracy circle — no InfoWindow). Layout is unified through one JS-measured `--app-vh` probe driving sheet translate, map inset, and floating buttons; writes flow through versioned soft-delete and the existing offline outbox.

**Tech Stack:** React 18 + Vite + TS strict, Supabase, TanStack Query, React Router, Naver Maps JS SDK v3, vitest, Playwright.

---

## Phase P0: Visual harness + baseline snapshots

### Task 1: e2e build script with dummy public env

**Files:**
- Modify: `/Users/minje/Project/love_place/package.json` (scripts block)

- [ ] Add a `build:e2e` script that bakes dummy public `VITE_*` so `isSupabaseConfigured` + `isNaverMapConfigured` are true in the preview build (per dossier 04 §G.5 / §I Step 0). Insert into `scripts`:
  ```jsonc
  "build:e2e": "VITE_SUPABASE_URL=https://e2e.supabase.co VITE_SUPABASE_ANON_KEY=e2e-anon-key VITE_NAVER_MAP_CLIENT_ID=e2e-naver-key vite build",
  ```
- [ ] Run `npm run build:e2e` and confirm it emits `dist/` with exit 0 (expected PASS). This proves the env bakes; no test asserts here yet.
- [ ] Run `npm run typecheck` (expected PASS — package.json change only).
- [ ] Commit:
  ```
  chore(e2e): 더미 공개 env로 인증·지도 빌드하는 build:e2e 스크립트 추가

  Playwright 하베스가 isSupabaseConfigured/isNaverMapConfigured=true인
  preview 빌드에 도달하도록 VITE_* 더미값을 vite build에 주입한다(dossier 04 §I).

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

### Task 2: Harness fixtures — naver stub + supabase route helpers

**Files:**
- Create: `/Users/minje/Project/love_place/e2e/harness/naverStub.ts`
- Create: `/Users/minje/Project/love_place/e2e/harness/seed.ts`

- [ ] Create `e2e/harness/naverStub.ts` exporting the SDK stub body and constants. The stub implements exactly the §E surface NaverMap calls (Map/LatLng/LatLngBounds/Point/Marker/Circle/Event), renders marker `icon.content` HTML into the map container so markers are visible, and is fired by `page.route` on the oapi script URL (dossier 04 §D.2/§E/§I):
  ```ts
  // e2e/harness/naverStub.ts — Playwright 하베스용 네이버 SDK 스텁(지도 타일 없이 DOM만).
  // page.route로 oapi 스크립트 URL을 이 본문으로 fulfill → 실행되면 window.naver.maps 설정 →
  // loadNaverMaps의 onload + window.naver?.maps 체크가 통과(dossier 04 §D.2).
  export const NAVER_SCRIPT_GLOB = 'https://oapi.map.naver.com/openapi/v3/maps.js**'

  export const NAVER_STUB_JS = `
  (function () {
    function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild || d; }
    function Point(x, y) { this.x = x; this.y = y; }
    function LatLng(lat, lng) { this._lat = lat; this._lng = lng; }
    LatLng.prototype.lat = function () { return this._lat; };
    LatLng.prototype.lng = function () { return this._lng; };
    function LatLngBounds() {}
    LatLngBounds.prototype.extend = function () { return this; };
    function Circle() {}
    Circle.prototype.setMap = function () {};
    Circle.prototype.setCenter = function () {};
    Circle.prototype.setRadius = function () {};
    Circle.prototype.setOptions = function () {};
    function Marker(opts) {
      this._opts = opts || {};
      this._pos = this._opts.position;
      this._node = null;
      if (this._opts.map) this.setMap(this._opts.map);
    }
    Marker.prototype.setMap = function (map) {
      if (!map) { if (this._node && this._node.parentNode) this._node.parentNode.removeChild(this._node); this._node = null; return; }
      var host = map._el; if (!host) return;
      var content = this._opts.icon && this._opts.icon.content;
      if (typeof content === 'string') { this._node = el(content); host.appendChild(this._node); }
      this._map = map;
    };
    Marker.prototype.setIcon = function (icon) { this._opts.icon = icon; if (this._map) { this.setMap(null); this.setMap(this._map); } };
    Marker.prototype.setZIndex = function () {};
    Marker.prototype.setPosition = function (p) { this._pos = p; };
    Marker.prototype.getPosition = function () { return this._pos; };
    function Map(elOrId, opts) {
      this._el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
      this._opts = opts || {};
    }
    Map.prototype.getZoom = function () { return this._opts.zoom || 11; };
    Map.prototype.setZoom = function (z) { this._opts.zoom = z; };
    Map.prototype.getCenter = function () { return this._opts.center; };
    Map.prototype.setCenter = function (c) { this._opts.center = c; };
    Map.prototype.panTo = function (c) { this._opts.center = c; };
    Map.prototype.fitBounds = function () {};
    var Event = {
      addListener: function (t, name, fn) { var h = { target: t, name: name, fn: fn }; return h; },
      removeListener: function () {},
    };
    window.naver = { maps: { Map: Map, LatLng: LatLng, LatLngBounds: LatLngBounds, Point: Point, Marker: Marker, Circle: Circle, Event: Event } };
  })();
  `
  ```
- [ ] Create `e2e/harness/seed.ts` with the localStorage session seeder + REST/auth route installer (dossier 04 §I Steps 1-6). It takes a `tables` payload so each test supplies its own canned rows:
  ```ts
  // e2e/harness/seed.ts — 세션 시드 + Supabase REST/auth + 네이버 스크립트 라우팅(dossier 04 §I).
  import type { Page } from '@playwright/test'
  import { NAVER_SCRIPT_GLOB, NAVER_STUB_JS } from './naverStub'

  export const USER_A = '00000000-0000-4000-8000-000000000a01'
  const FAR_FUTURE = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600

  export type SeedTables = {
    places?: unknown[]
    wishes?: unknown[]
    visits?: unknown[]
    reactions?: unknown[]
    profiles?: unknown[]
  }

  function jsonRoute(body: unknown) {
    return (route: import('@playwright/test').Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  }

  export async function seedAuthedMap(page: Page, tables: SeedTables = {}): Promise<void> {
    const session = {
      access_token: 'e2e', token_type: 'bearer', expires_in: 3600, expires_at: FAR_FUTURE,
      refresh_token: 'e2e',
      user: { id: USER_A, aud: 'authenticated', role: 'authenticated', email: 'me@e2e.test', app_metadata: {}, user_metadata: {}, created_at: '2020-01-01T00:00:00Z' },
    }
    await page.addInitScript(([key, val]) => {
      window.localStorage.setItem(key as string, val as string)
    }, ['sb-e2e-auth-token', JSON.stringify(session)])

    await page.route(NAVER_SCRIPT_GLOB, (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: NAVER_STUB_JS }),
    )
    await page.route('**/e2e.supabase.co/auth/v1/token**', jsonRoute(session))
    await page.route('**/e2e.supabase.co/rest/v1/couples**', jsonRoute({
      id: 'c1', status: 'ACTIVE', user_a: USER_A, user_b: '00000000-0000-4000-8000-000000000a02', connected_at: '2020-01-01T00:00:00Z',
    }))
    await page.route('**/e2e.supabase.co/rest/v1/profiles**', jsonRoute(tables.profiles ?? []))
    await page.route('**/e2e.supabase.co/rest/v1/places**', jsonRoute(tables.places ?? []))
    await page.route('**/e2e.supabase.co/rest/v1/wishes**', jsonRoute(tables.wishes ?? []))
    await page.route('**/e2e.supabase.co/rest/v1/visits**', jsonRoute(tables.visits ?? []))
    await page.route('**/e2e.supabase.co/rest/v1/reactions**', jsonRoute(tables.reactions ?? []))
    await page.route('**/realtime/v1/websocket**', (route) => route.abort())
  }
  ```
- [ ] Run `npm run typecheck` (expected PASS — `e2e/` is excluded from vitest but typechecked by `tsc --noEmit` via the project config; if `e2e/` is NOT in the tsconfig `include`, this is a no-op, still PASS).
- [ ] Commit:
  ```
  test(e2e): 인증된 지도 화면 도달용 하베스 픽스처(네이버 스텁·세션 시드·REST 라우팅)

  page.route로 oapi 스크립트를 window.naver.maps 설정 본문으로 fulfill하고,
  sb-e2e-auth-token 세션 시드 + couples ACTIVE + 테이블 canned JSON으로
  RequireAuth/useCouple 게이트를 통과시킨다(dossier 04 §I).

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

### Task 3: Harness spec — baseline scenario screenshots

**Files:**
- Create: `/Users/minje/Project/love_place/e2e/map-harness.spec.ts`

- [ ] Write the harness spec covering the six baseline states (empty / N places / selected detail / search preview / peek+half / light+dark). Functional `toBeVisible` assertions are the unconditional CI gate; `toHaveScreenshot` is guarded by the same per-platform pattern as `smoke.spec.ts` (dossier 04 §G.2/§I Step 3). NOTE: the selected-detail and preview shots depend on P2 components existing — write them to assert on the **sheet** text (peek summary, detail name) which renders regardless of the naver stub fidelity, so the spec is green before P2 by asserting only the states reachable now, and the detail/preview assertions become meaningful after P2. To keep it green at P0, assert detail/preview by driving list selection + search overlay which exist today:
  ```ts
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
    await page.getByRole('button', { name: '속초 칠성조선소 지도에서 보기' }).click()
    await expect(page.getByRole('region', { name: '장소 시트' })).toBeVisible()
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
  ```
- [ ] Build then run e2e: `npm run build:e2e && npm run e2e` (expected: functional assertions PASS; screenshots SKIP on first run because no baseline exists). The existing `smoke.spec.ts` must stay green.
- [ ] Seed baselines locally on darwin: `npm run build:e2e && SEED_SNAPSHOT=1 npm run e2e` (creates `map-harness.spec.ts-snapshots/*-mobile-chromium-darwin.png`). Re-run `npm run e2e` → screenshots now PASS.
- [ ] Run `npm run typecheck` (expected PASS).
- [ ] Commit (include the generated baseline PNGs):
  ```
  test(e2e): 지도 화면 비주얼 하베스 베이스라인(빈/N개/선택/다크)

  세션 시드 + REST 라우팅으로 인증된 지도에 도달해 핵심 상태를 캡처한다.
  toBeVisible은 무조건 게이트, toHaveScreenshot은 동일 OS 베이스라인 가드(smoke 패턴).

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

## Phase P1: 3-band layout (tab bar anchor · dvh unify · touch-action · backdrop/half-cap · button/toast)

### Task 4: `--app-vh` probe + content-based peek tokens

**Files:**
- Modify: `/Users/minje/Project/love_place/src/styles/tokens.css` (`:root` layout constants, ~lines 851-859)
- Create: `/Users/minje/Project/love_place/src/lib/layout/appViewport.ts`
- Create: `/Users/minje/Project/love_place/src/__tests__/appViewport.test.ts`

- [ ] Write a failing test for the pure probe-value helper (the single source feeding sheet/map-inset/floating button). It computes effective sheet travel height = measured vh minus tab bar minus safe-bottom:
  ```ts
  import { describe, it, expect } from 'vitest'
  import { sheetTravelHeight } from '@/lib/layout/appViewport'

  describe('appViewport (단일 dvh 소스 — 탭바 제외 시트 이동 높이)', () => {
    it('시트 이동 높이 = vh - tabbarH - safeBottom', () => {
      expect(sheetTravelHeight(800, 72, 0)).toBe(728)
      expect(sheetTravelHeight(800, 72, 34)).toBe(694)
    })
    it('음수로 떨어지지 않게 0으로 클램프', () => {
      expect(sheetTravelHeight(50, 72, 34)).toBe(0)
    })
  })
  ```
- [ ] Run `npm run test -- src/__tests__/appViewport.test.ts` (expected FAIL — module missing).
- [ ] Create `src/lib/layout/appViewport.ts`:
  ```ts
  // 단일 dvh 소스(research 01 §15.5) — JS가 측정한 뷰포트 높이로 --app-vh를 설정하고,
  // 시트 translateY·지도 인셋·플로팅 버튼이 모두 이 한 값에서 도출되게 한다(CSS dvh vs JS innerHeight 불일치 제거).

  /** 시트가 이동할 수 있는 실효 높이 = 측정 vh − 탭바 − 하단 safe-area. 음수는 0으로 클램프(순수). */
  export function sheetTravelHeight(vh: number, tabbarH: number, safeBottom: number): number {
    return Math.max(0, vh - tabbarH - safeBottom)
  }

  /** 측정한 innerHeight를 --app-vh(px)로 문서 루트에 반영. CSS(peek)·JS(translate)가 같은 값을 읽는다. */
  export function setAppVh(vh: number): void {
    if (typeof document === 'undefined') return
    document.documentElement.style.setProperty('--app-vh', `${vh}px`)
  }
  ```
- [ ] Run `npm run test -- src/__tests__/appViewport.test.ts` (expected PASS).
- [ ] In `tokens.css`, add `--app-vh` and make peek a content-based fixed px (replace the `18dvh` ratio mirror); keep `--tabbar-h: 72px`. Replace the `--sheet-peek-h` line and add `--app-vh`:
  ```css
    --tabbar-h: 72px;
    /* peek 밴드 = 콘텐츠 기반 고정 px(핸들+요약+필터 칩 높이 근사). 비율(dvh) 대신 고정 px로
       JS innerHeight와 어긋나지 않게 한다(research 01 §15.4). half/full만 비율(sheetSnap). */
    --sheet-peek-h: calc(112px + var(--safe-bottom));
    /* --app-vh: JS가 측정한 뷰포트 높이(px). 미설정 초기값은 100dvh로 폴백(setAppVh가 곧 덮어씀). */
    --app-vh: 100dvh;
  ```
- [ ] Run `npm run typecheck` (expected PASS) and `npm run build` (expected PASS — CSS valid).
- [ ] Commit:
  ```
  feat(map): 단일 --app-vh 소스 + 콘텐츠 기반 peek 고정 px(dvh/innerHeight 통일)

  JS 측정 뷰포트 높이를 --app-vh로 반영하고 시트 이동 높이는 탭바·safe-area를
  제외한 순수 함수로 도출(research 01 §15). peek는 18dvh 비율→고정 px로 전환.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

### Task 5: sheetSnap excludes tab bar (peek px + travel height)

**Files:**
- Modify: `/Users/minje/Project/love_place/src/lib/places/sheetSnap.ts`
- Modify: `/Users/minje/Project/love_place/src/__tests__/sheetSnap.test.ts`

- [ ] Update `sheetSnap.test.ts` to lock the new tab-bar-excluding math. `translateYFor`/`snapForOffset` now take an explicit `peekPx` for the peek stop and a travel height that excludes the tab bar; half/full stay ratio-based on travel height. Replace the `snapForOffset` numeric block and add a peek-px assertion:
  ```ts
  import { describe, it, expect } from 'vitest'
  import { SNAPS, nextSnap, prevSnap, snapForOffset, translateYFor } from '@/lib/places/sheetSnap'

  describe('sheetSnap (시트 스냅 전이 — 탭바 제외)', () => {
    it('SNAPS는 peek<half<full 순으로 비율을 정의한다', () => {
      expect(SNAPS.map((s) => s.id)).toEqual(['peek', 'half', 'full'])
      expect(SNAPS[0]!.ratio).toBeLessThan(SNAPS[1]!.ratio)
      expect(SNAPS[1]!.ratio).toBeLessThan(SNAPS[2]!.ratio)
    })

    it('nextSnap: peek→half→full→full(클램프)', () => {
      expect(nextSnap('peek')).toBe('half')
      expect(nextSnap('half')).toBe('full')
      expect(nextSnap('full')).toBe('full')
    })

    it('prevSnap: full→half→peek→peek(클램프)', () => {
      expect(prevSnap('full')).toBe('half')
      expect(prevSnap('half')).toBe('peek')
      expect(prevSnap('peek')).toBe('peek')
    })

    it('translateYFor: peek는 콘텐츠 px만 보이게(travel - peekPx), half/full은 travel 비율', () => {
      // travel(탭바 제외) = 728, peekPx = 128 → peek translate = 728 - 128 = 600
      expect(translateYFor('peek', 728, 128)).toBe(600)
      // half ratio 0.5 → translate = 728*(1-0.5) = 364
      expect(translateYFor('half', 728, 128)).toBe(364)
      // full ratio 0.92 → translate = 728*(1-0.92) = 58.24
      expect(translateYFor('full', 728, 128)).toBeCloseTo(58.24, 2)
    })

    it('snapForOffset: 가까운 스냅으로 흡착(travel + peekPx 기준)', () => {
      const travel = 728
      const peekPx = 128
      expect(snapForOffset(600, travel, peekPx)).toBe('peek')
      expect(snapForOffset(360, travel, peekPx)).toBe('half')
      expect(snapForOffset(60, travel, peekPx)).toBe('full')
    })

    it('snapForOffset: 화면 밖(음수/초과)도 클램프해 가장 가까운 스냅', () => {
      const travel = 728
      const peekPx = 128
      expect(snapForOffset(-50, travel, peekPx)).toBe('full')
      expect(snapForOffset(99999, travel, peekPx)).toBe('peek')
    })
  })
  ```
- [ ] Run `npm run test -- src/__tests__/sheetSnap.test.ts` (expected FAIL — signatures mismatch).
- [ ] Update `sheetSnap.ts`: keep `SNAPS`/`nextSnap`/`prevSnap`; change `translateYFor`/`snapForOffset` to `(stop, travelHeight, peekPx)` where peek uses `travelHeight - peekPx` and half/full use `travelHeight * (1 - ratio)`:
  ```ts
  /** ratio → 시트 상단 translateY(px). 탭바 제외 travel 높이 기준. peek는 콘텐츠 px만 노출. */
  export function translateYFor(stop: SnapStop, travelHeight: number, peekPx: number): number {
    if (stop === 'peek') return Math.max(0, travelHeight - peekPx)
    const def = SNAPS.find((s) => s.id === stop)!
    return travelHeight * (1 - def.ratio)
  }

  /** 드래그 종료 시 현재 translateY에 가장 가까운 스냅으로 흡착(탭바 제외 travel + peekPx 기준). */
  export function snapForOffset(translateY: number, travelHeight: number, peekPx: number): SnapStop {
    let best: SnapStop = 'peek'
    let bestDist = Infinity
    for (const s of SNAPS) {
      const y = s.id === 'peek' ? Math.max(0, travelHeight - peekPx) : travelHeight * (1 - s.ratio)
      const d = Math.abs(translateY - y)
      if (d < bestDist) {
        bestDist = d
        best = s.id
      }
    }
    return best
  }
  ```
- [ ] Run `npm run test -- src/__tests__/sheetSnap.test.ts` (expected PASS).
- [ ] Run `npm run typecheck` (expected FAIL — `PlaceSheet.tsx` still calls the 2-arg form; this is fixed in Task 6. This task is NOT independently typecheck-clean and must be committed together with Task 6, OR commit now noting the known break. Choose: combine commit with Task 6.)
- [ ] Defer commit; combine with Task 6 (see Task 6 final commit).

### Task 6: PlaceSheet — anchor above tab bar, --app-vh wiring, touch-action split, peek measure

**Files:**
- Modify: `/Users/minje/Project/love_place/src/components/places/PlaceSheet.tsx` (~lines 144-199)
- Modify: `/Users/minje/Project/love_place/src/components/places/PlaceSheet.module.css` (.sheet ~307-324, .body ~370-378, add .backdrop)
- Modify: `/Users/minje/Project/love_place/src/__tests__/placeSheet.test.tsx`

- [ ] Add a failing test asserting the sheet panel is a `region` (P3.7 role change is here too) anchored data — assert it exposes `role="region"` named '장소 시트' and the handle has `aria-expanded`. Add to `placeSheet.test.tsx` describe block:
  ```ts
  it('시트는 항상 보이는 패널이므로 role=region + aria-label(modal 아님, spec §3.7)', () => {
    renderSheet()
    expect(screen.getByRole('region', { name: '장소 시트' })).toBeInTheDocument()
  })

  it('핸들 버튼에 aria-expanded(peek=false)가 있다', () => {
    renderSheet()
    const btn = screen.getByRole('button', { name: /시트/ })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
  })
  ```
  Also replace EVERY `getByRole('dialog', { name: '장소 시트' })` in `placeSheet.test.tsx` with `getByRole('region', { name: '장소 시트' })`. There are currently THREE occurrences (line 50 in its own role test, line 86, and line 110), not one — leaving any of them on `dialog` after PlaceSheet becomes `role="region"` (line 436 below) makes that lookup throw "Unable to find role dialog" and the suite fails. Use replace_all semantics so all three switch to `region`.
- [ ] Run `npm run test -- src/__tests__/placeSheet.test.tsx` (expected FAIL — still `role="dialog"`).
- [ ] In `PlaceSheet.tsx`: import `setAppVh`, `sheetTravelHeight` from `@/lib/layout/appViewport`; add `--tabbar-h`/`--safe-bottom` numeric reads via measured constants. Replace the `vh` effect and `restY` math:
  - Add a `peekPx` measure via a ref on the peek header (`peekRef`), measured in a layout effect.
  - Change the viewport effect to also call `setAppVh(window.innerHeight)`.
  - Compute `const TABBAR_H = 72; const safeBottom = ...` from a computed style read, or pass tab bar height as the constant 72 (matches `--tabbar-h`). Derive `const travel = sheetTravelHeight(vh, TABBAR_H, safeBottom)` and `const restY = translateYFor(snap, travel, peekPx)`.
  - Update `onPointerMove` clamp to `Math.min(travel, ...)` (was `vh`) so the sheet cannot drop behind the tab bar.
  - Update `endDrag` to `snapForOffset(dragY, travel, peekPx)`.
  Concrete edits:
  ```tsx
  import { sheetTravelHeight, setAppVh } from '@/lib/layout/appViewport'
  // ...
  const TABBAR_H = 72 // = --tabbar-h(tokens.css). 시트는 탭바 위에 앵커.
  const peekRef = useRef<HTMLDivElement>(null)
  const [peekPx, setPeekPx] = useState(128)
  const [safeBottom, setSafeBottom] = useState(0)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const measure = () => {
      setVh(window.innerHeight)
      setAppVh(window.innerHeight)
      if (peekRef.current) setPeekPx(peekRef.current.getBoundingClientRect().height)
      const sb = getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')
      const px = parseFloat(sb) || 0
      setSafeBottom(px)
    }
    measure()
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [])
  const travel = sheetTravelHeight(vh, TABBAR_H, safeBottom)
  const restY = translateYFor(snap, travel, peekPx)
  ```
  Replace `setDragY(Math.max(0, Math.min(vh, ...)))` with `Math.min(travel, ...)`, and `snapForOffset(dragY, vh)` with `snapForOffset(dragY, travel, peekPx)`.
  Change the root element to `role="region"` (drop `aria-modal`), add `ref={peekRef}` to the `peekHeader` div, and add `aria-expanded={snap !== 'peek'}` to the handle button:
  ```tsx
  <div
    ref={sheetRef}
    className={styles.sheet}
    role="region"
    aria-label="장소 시트"
    style={{ transform: `translateY(${translateY}px)` }}
  >
  ```
  ```tsx
  <div ref={peekRef} className={styles.peekHeader} data-peek-pinned="true">
  ```
  ```tsx
  <button
    type="button"
    className={styles.handleBtn}
    onClick={cycleSnap}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={endDrag}
    onPointerCancel={endDrag}
    aria-expanded={snap !== 'peek'}
    aria-label={handleLabel}
  >
  ```
- [ ] In `PlaceSheet.module.css`, re-anchor `.sheet` above the tab bar using `--app-vh`, split `touch-action`, and fix `.body` bottom padding (remove the duplicate `72px`, the tab bar is no longer overlapped):
  ```css
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(var(--tabbar-h) + var(--safe-bottom));
    height: calc(var(--app-vh) - var(--tabbar-h) - var(--safe-bottom));
    max-width: 480px;
    margin: 0 auto;
    background: var(--c-surface);
    border-radius: var(--radius) var(--radius) 0 0;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    z-index: 45;
    transition: transform var(--motion-base) var(--ease);
    will-change: transform;
  }
  ```
  Add `touch-action: none;` to `.handleBtn` (drag) and `touch-action: pan-y;` to `.body` (scroll); change `.body` padding-bottom from `calc(var(--sp-6) + 72px + var(--safe-bottom))` to `var(--sp-6)`.
- [ ] Run `npm run test -- src/__tests__/placeSheet.test.tsx` (expected PASS) and `npm run test -- src/__tests__/sheetSnap.test.ts` (expected PASS).
- [ ] Run `npm run typecheck` (expected PASS — Task 5 + Task 6 together) and `npm run build` (expected PASS).
- [ ] Commit (combined Task 5 + 6):
  ```
  feat(map): 시트를 탭바 위에 앵커 + translate/peek에서 탭바 제외(3밴드)

  sheetSnap.translateYFor/snapForOffset를 (travel, peekPx) 시그니처로 바꿔
  탭바·safe-area를 제외하고, .sheet bottom=tabbar+safe·height=app-vh로 재앵커.
  touch-action 분리(handle none / body pan-y), role=region + aria-expanded.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

### Task 7: Tab bar z-index above sheet

**Files:**
- Modify: `/Users/minje/Project/love_place/src/components/nav/TabBar.module.css` (.tabbar ~1077-1084)

- [ ] In `TabBar.module.css`, give `.tabbar` a positioning context + `z-index: 46` so it paints above the sheet (45) (research 01 §0.2/§10 notes — a z-index needs `position`):
  ```css
  .tabbar {
    position: relative;
    z-index: 46;
    display: flex;
    justify-content: space-around;
    align-items: stretch;
    background: var(--c-surface);
    border-top: 1px solid var(--c-border);
    padding-bottom: var(--safe-bottom);
  }
  ```
- [ ] Run `npm run build` (expected PASS) and `npm run typecheck` (expected PASS).
- [ ] Run `npm run e2e` (expected PASS — sheet no longer covers tab bar; if a darwin baseline now differs intentionally, re-seed with `SEED_SNAPSHOT=1` and re-run).
- [ ] Commit:
  ```
  fix(map): 탭바 z-index 46 + position relative로 시트(45) 위에 표시

  탭바가 정상 흐름이라 z-index가 안 먹던 문제를 position 부여로 해결,
  재앵커된 시트가 탭바를 가리지 않게 한다(research 01 §0.2).

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

### Task 8: Map inset + floating button/toast follow the unified source; hide my-location at snap>peek; backdrop at expand

**Files:**
- Modify: `/Users/minje/Project/love_place/src/pages/MapPage.tsx` (lift `snap` state; pass `snap` to NaverMap + `snap`/`onSnapChange` to PlaceSheet)
- Modify: `/Users/minje/Project/love_place/src/components/places/PlaceSheet.tsx` (accept controlled `snap`/`onSnapChange`; render backdrop)
- Modify: `/Users/minje/Project/love_place/src/components/map/NaverMap.tsx` (accept `snap`; hide `.myLocBtn`/`.locToast` when `snap !== 'peek'`)
- Modify: `/Users/minje/Project/love_place/src/pages/MapPage.module.css` (.mapWrap ~612-618)
- Modify: `/Users/minje/Project/love_place/src/components/map/NaverMap.module.css` (.myLocBtn ~733-747, .locToast ~751-764)
- Modify: `/Users/minje/Project/love_place/src/components/places/PlaceSheet.module.css` (add .backdrop)
- Modify: `/Users/minje/Project/love_place/src/__tests__/placeSheet.test.tsx` (controlled-snap defaults)
- Modify: `/Users/minje/Project/love_place/e2e/map-harness.spec.ts` (assert my-location button not occluded at half)

- [ ] In `MapPage.module.css`, change the map inset to include the tab bar band (now that the sheet sits above the tab bar, the map must inset by peek + tabbar + safe-bottom):
  ```css
  .mapWrap {
    position: relative;
    flex: 1;
    display: flex;
    min-height: 0;
    padding-bottom: calc(var(--sheet-peek-h) + var(--tabbar-h) + var(--safe-bottom));
  }
  ```
- [ ] In `NaverMap.module.css`, raise `.myLocBtn` and `.locToast` above the peek+tabbar band so at peek they are not hidden by the sheet/tab bar:
  ```css
  .myLocBtn {
    /* ...unchanged props... */
    bottom: calc(var(--sheet-peek-h) + var(--tabbar-h) + var(--sp-3));
  }
  .locToast {
    /* ...unchanged props... */
    bottom: calc(var(--sheet-peek-h) + var(--tabbar-h) + var(--sp-6));
  }
  ```
- [ ] Static `bottom` only un-occludes the **peek** case — at half/full the sheet covers far more than the peek band, so the button/toast pinned at peek height would again sit behind the sheet (spec §3.1 "snap>peek면 버튼 숨기거나 시트 상단 따라가게"). Make them snap-aware by lifting `snap` to MapPage and threading it to `NaverMap`. In `MapPage.tsx`, lift the sheet snap into MapPage so both `NaverMap` and `PlaceSheet` read the same value:
  ```tsx
  import { type SnapStop } from '@/lib/places/sheetSnap'
  // ...inside MapPage:
  const [snap, setSnap] = useState<SnapStop>('peek')
  ```
  Pass `snap={snap}` to `<NaverMap>` and `snap={snap}`/`onSnapChange={setSnap}` to `<PlaceSheet>`.
- [ ] In `PlaceSheet.tsx`, make `snap` controlled by MapPage instead of local state. Add props `snap: SnapStop` and `onSnapChange: (s: SnapStop) => void`; remove the local `const [snap, setSnap] = useState<SnapStop>('peek')` and define `const setSnap = onSnapChange` (every existing `setSnap(...)` call — `cycleSnap`, the selectedId→half effect, `endDrag`, the backdrop tap — keeps working unchanged). This keeps the sheet the single snap authority while exposing it upward.
- [ ] In `placeSheet.test.tsx`, add controlled-snap defaults to `renderSheet` so existing tests still compile, defaulting to local-state behavior via a small wrapper that holds snap:
  ```tsx
  // renderSheet: wrap PlaceSheet so snap stays interactive in tests.
  function Harness(props: Parameters<typeof PlaceSheet>[0]) {
    const [snap, setSnap] = useState<SnapStop>('peek')
    return <PlaceSheet {...props} snap={snap} onSnapChange={setSnap} />
  }
  ```
  (Add `import { useState } from 'react'` and `import type { SnapStop } from '@/lib/places/sheetSnap'`; render `<Harness {...props} />` instead of `<PlaceSheet {...props} />`.)
- [ ] In `NaverMap.tsx`, add prop `snap: SnapStop` to the props type and destructure it. When `snap !== 'peek'`, hide the my-location button and the location toast (they would otherwise be occluded by the expanded sheet) by setting `hidden`/`aria-hidden` and a CSS `data-hidden` flag rather than removing them from the tree:
  ```tsx
  import type { SnapStop } from '@/lib/places/sheetSnap'
  // ...
  const floatingHidden = snap !== 'peek'
  // my-location button JSX:
  <button
    type="button"
    className={styles.myLocBtn}
    onClick={recenter}
    aria-label="내 위치로 이동"
    aria-hidden={floatingHidden}
    data-hidden={floatingHidden ? 'true' : undefined}
    tabIndex={floatingHidden ? -1 : 0}
  >
  // location toast JSX (when locToast is non-null):
  <div className={styles.locToast} role="status" aria-hidden={floatingHidden} data-hidden={floatingHidden ? 'true' : undefined}>
  ```
  Add to `NaverMap.module.css` a shared hidden rule for both:
  ```css
  /* snap>peek면 확장된 시트에 가리지 않게 플로팅 버튼/토스트를 숨긴다(spec §3.1). */
  .myLocBtn[data-hidden='true'],
  .locToast[data-hidden='true'] {
    opacity: 0;
    pointer-events: none;
    visibility: hidden;
  }
  ```
- [ ] Add `.backdrop` to `PlaceSheet.module.css` (dim map at half/full, tap-to-collapse, z between map and sheet, Reduce-Motion handled by global token):
  ```css
  /* full/half 확장 시 지도 위 백드롭 — 탭하면 collapse. 탭바(46)·시트(45) 아래(44). */
  .backdrop {
    position: fixed;
    left: 0;
    right: 0;
    top: 0;
    bottom: calc(var(--tabbar-h) + var(--safe-bottom));
    background: rgba(0, 0, 0, 0.28);
    z-index: 44;
    border: none;
    cursor: pointer;
    transition: opacity var(--motion-base) var(--ease);
  }
  ```
- [ ] In `PlaceSheet.tsx`, render the backdrop when `snap !== 'peek'`, collapsing to peek on tap (place it as a sibling before the sheet div, inside the returned fragment — wrap return in `<>`):
  ```tsx
  return (
    <>
      {snap !== 'peek' ? (
        <button
          type="button"
          className={styles.backdrop}
          aria-label="시트 접기"
          onClick={() => setSnap('peek')}
        />
      ) : null}
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="region"
        aria-label="장소 시트"
        style={{ transform: `translateY(${translateY}px)` }}
      >
        {/* ...existing sheet body... */}
      </div>
    </>
  )
  ```
- [ ] Add a test asserting the backdrop appears after expand and collapses on click. Append to `placeSheet.test.tsx`:
  ```ts
  it('half/full 확장 시 백드롭이 뜨고 탭하면 peek로 접힌다', () => {
    renderSheet()
    const handle = screen.getByRole('button', { name: /시트/ })
    fireEvent.click(handle) // peek→half
    const backdrop = screen.getByRole('button', { name: '시트 접기' })
    expect(backdrop).toBeInTheDocument()
    fireEvent.click(backdrop)
    expect(screen.queryByRole('button', { name: '시트 접기' })).toBeNull()
  })
  ```
- [ ] Add a harness assertion that the my-location button is not occluded once the sheet expands past peek (spec §3.1). Append to `e2e/map-harness.spec.ts`:
  ```ts
  test('내 위치 버튼은 시트가 half로 펼쳐지면 가려지지 않게 숨는다(snap>peek)', async ({ page }) => {
    await seedAuthedMap(page, { places: PLACES })
    await page.goto('/')
    const locBtn = page.getByRole('button', { name: '내 위치로 이동' })
    // peek에서는 보임(탭바 위 가시 밴드).
    await expect(locBtn).toBeVisible()
    // 핸들을 눌러 half로 펼치면(snap>peek) 버튼은 data-hidden=true로 숨겨 시트에 가리지 않는다.
    await page.getByRole('button', { name: /시트/ }).click()
    await expect(locBtn).toHaveAttribute('data-hidden', 'true')
    await expect(locBtn).toBeHidden()
  })
  ```
- [ ] Run `npm run test -- src/__tests__/placeSheet.test.tsx` (expected PASS).
- [ ] Run `npm run typecheck` (expected PASS) and `npm run build` (expected PASS).
- [ ] Run `npm run build:e2e && npm run e2e` (expected PASS; new functional assertions gate, screenshots SKIP/re-seed as in Task 3).
- [ ] Commit:
  ```
  feat(map): 지도 인셋·플로팅 버튼/토스트를 탭바 포함 단일 밴드에 정렬 + snap>peek 숨김 + 확장 백드롭

  mapWrap 인셋과 myLocBtn/locToast bottom에 --tabbar-h를 더해 peek에서 시트/탭바
  위에 보이게 하고, snap을 MapPage로 끌어올려 NaverMap에 전달 → snap>peek면
  내 위치 버튼/토스트를 숨겨(data-hidden) 펼친 시트에 가리지 않게 한다(spec §3.1).
  half/full 확장 시 탭하면 접히는 백드롭(z 44)도 추가한다.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

### Task 8b: Search overlay collapses when snap>peek (no clash with expanded sheet)

**Files:**
- Modify: `/Users/minje/Project/love_place/src/pages/MapPage.tsx` (pass `snap` to MapSearchOverlay)
- Modify: `/Users/minje/Project/love_place/src/components/places/MapSearchOverlay.tsx` (accept `snap`; hide when `snap !== 'peek'`)
- Modify: `/Users/minje/Project/love_place/src/components/places/MapSearchOverlay.module.css` (`.overlay[data-hidden='true']`)
- Modify: `/Users/minje/Project/love_place/src/__tests__/mapSearchOverlay.test.tsx` (snap-hide assertion)
- Modify: `/Users/minje/Project/love_place/e2e/map-harness.spec.ts` (overlay hidden at half)

The overlay sits on the map (`MapPage` renders it inside `.mapWrap` above `NaverMap`) at `z-index: 50` — already above the backdrop (44) and sheet (45), so it stays reachable. But spec §3.1 ("검색 오버레이는 snap>peek면 시트 헤더로 접거나 가림 방지") requires it to collapse when the sheet expands so it does not visually clash with the half/full sheet. `MapSearchOverlay` currently has no snap awareness (grep: no `snap`/`z-index` handling in the TSX). Thread the lifted `snap` (Task 8) and collapse the overlay at `snap !== 'peek'`.

- [ ] Add a failing test in `mapSearchOverlay.test.tsx` asserting the overlay collapses (`data-hidden='true'`) when `snap !== 'peek'`:
  ```tsx
  it('snap>peek면 검색 오버레이는 collapse(data-hidden=true)되어 펼친 시트와 겹치지 않는다', () => {
    const { rerender } = render(
      <MapSearchOverlay coupleId="c1" savedKakaoIds={new Set<string>()} onPick={() => {}} snap="peek" />,
    )
    expect(screen.getByTestId('search-overlay')).not.toHaveAttribute('data-hidden', 'true')
    rerender(
      <MapSearchOverlay coupleId="c1" savedKakaoIds={new Set<string>()} onPick={() => {}} snap="half" />,
    )
    expect(screen.getByTestId('search-overlay')).toHaveAttribute('data-hidden', 'true')
  })
  ```
  (Add `import { MapSearchOverlay } from '@/components/places/MapSearchOverlay'` and `data-testid="search-overlay"` is added below.)
- [ ] Run `npm run test -- src/__tests__/mapSearchOverlay.test.tsx` (expected FAIL — `snap` prop not accepted, no `data-hidden`).
- [ ] In `MapSearchOverlay.tsx`, add prop `snap: SnapStop` and set `data-hidden` when collapsed:
  ```tsx
  import type { SnapStop } from '@/lib/places/sheetSnap'
  // ...
  export function MapSearchOverlay({
    coupleId,
    savedKakaoIds,
    onPick,
    snap,
  }: {
    coupleId: string | null
    savedKakaoIds: Set<string>
    onPick: (hit: KakaoPlaceHit) => void
    snap: SnapStop
  }) {
    const collapsed = snap !== 'peek'
    return (
      <div
        className={styles.overlay}
        data-search-overlay="true"
        data-testid="search-overlay"
        data-hidden={collapsed ? 'true' : undefined}
        aria-hidden={collapsed}
      >
        <PlaceSearch coupleId={coupleId} savedKakaoIds={savedKakaoIds} onPick={onPick} />
      </div>
    )
  }
  ```
- [ ] In `MapSearchOverlay.module.css`, add the collapsed rule (kept above backdrop so it never sits under the sheet; collapse hides it when the sheet is expanded):
  ```css
  /* snap>peek면 검색 오버레이를 접어 펼친 시트와 겹치지 않게 한다(spec §3.1). */
  .overlay[data-hidden='true'] {
    opacity: 0;
    pointer-events: none;
    visibility: hidden;
  }
  ```
- [ ] In `MapPage.tsx`, pass `snap={snap}` (lifted in Task 8) to `<MapSearchOverlay>`:
  ```tsx
  <MapSearchOverlay coupleId={coupleId} savedKakaoIds={savedKakaoIds} onPick={onPick} snap={snap} />
  ```
- [ ] Add a harness assertion. Append to `e2e/map-harness.spec.ts`:
  ```ts
  test('검색 오버레이는 시트가 half로 펼쳐지면(snap>peek) 접힌다', async ({ page }) => {
    await seedAuthedMap(page, { places: PLACES })
    await page.goto('/')
    const overlay = page.getByTestId('search-overlay')
    await expect(overlay).toBeVisible()
    await page.getByRole('button', { name: /시트/ }).click() // peek→half
    await expect(overlay).toHaveAttribute('data-hidden', 'true')
    await expect(overlay).toBeHidden()
  })
  ```
- [ ] Run `npm run test -- src/__tests__/mapSearchOverlay.test.tsx` (expected PASS).
- [ ] Run `npm run typecheck` (expected PASS) and `npm run build` (expected PASS).
- [ ] Run `npm run build:e2e && npm run e2e` (expected PASS — functional assertions gate; screenshots SKIP/re-seed as in Task 3).
- [ ] Commit:
  ```
  feat(map): 검색 오버레이를 snap>peek면 접어 펼친 시트와 겹침 방지

  MapPage가 끌어올린 snap을 MapSearchOverlay로 전달하고, snap!=='peek'이면
  오버레이를 data-hidden으로 접어 half/full 시트와 시각적으로 충돌하지 않게 한다.
  오버레이는 z-50로 백드롭(44)·시트(45) 위라 접기 전까지는 항상 도달 가능(spec §3.1).

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

## Phase P2: Sheet detail (InfoWindow removal)

### Task 9: PlaceDetail component (selected saved place)

**Files:**
- Create: `/Users/minje/Project/love_place/src/components/places/PlaceDetail.tsx`
- Create: `/Users/minje/Project/love_place/src/components/places/PlaceDetail.module.css`
- Create: `/Users/minje/Project/love_place/src/__tests__/placeDetail.test.tsx`

- [ ] Write failing tests for the React detail (status glyph+text, 가봤어요/가봤음 toggle, ❤️ react + count, close, focus + aria-live). Mirror `placeSearch.test.tsx` conventions:
  ```tsx
  import { describe, it, expect, vi } from 'vitest'
  import { render, screen, fireEvent } from '@testing-library/react'
  import { PlaceDetail } from '@/components/places/PlaceDetail'
  import type { WithWish } from '@/lib/places/wishStatus'
  import type { PlaceRow } from '@/hooks/usePlaces'

  const wish = { wishedByMe: true, wishedByPartner: true, bothWished: true, wishCount: 2, totalPriority: 2, maxPriority: 1 }
  const place: WithWish<PlaceRow> = {
    id: 'p1', name: '칠성"조선소', address: '속초시', region_label: '속초', lat: 38, lng: 128,
    category: '카페', kakao_place_id: 'k1', added_by: 'u1', version: 1, wish,
  }
  function base() {
    return { place, visited: false, didIReact: false, reactionCount: 0, busy: false,
      onVisit: vi.fn(), onUnvisit: vi.fn(), onReact: vi.fn(), onClose: vi.fn() }
  }

  describe('PlaceDetail (선택 장소 시트 상세 — React)', () => {
    it('이름·상태(글리프+텍스트) 표시: 둘 다 찜=♥', () => {
      render(<PlaceDetail {...base()} />)
      expect(screen.getByText('칠성"조선소')).toBeInTheDocument()
      expect(screen.getByText('둘 다 찜')).toBeInTheDocument()
      expect(screen.getByLabelText('장소 상세')).toHaveAttribute('aria-live', 'polite')
    })
    it('가봤음이면 ★ + 가봤음(취소) 토글 → onUnvisit', () => {
      render(<PlaceDetail {...base()} visited />)
      const btn = screen.getByRole('button', { name: /가봤음 기록 취소/ })
      fireEvent.click(btn)
      expect(base().onUnvisit).toBeDefined()
    })
    it('미방문이면 다녀왔어요 → onVisit', () => {
      const p = base()
      render(<PlaceDetail {...p} />)
      fireEvent.click(screen.getByRole('button', { name: /다녀왔어요/ }))
      expect(p.onVisit).toHaveBeenCalledTimes(1)
    })
    it('❤️ 리액션 버튼: 내가 안 눌렀으면 🤍, count>0이면 숫자, 클릭 시 onReact', () => {
      const p = { ...base(), reactionCount: 2 }
      render(<PlaceDetail {...p} />)
      const react = screen.getByRole('button', { name: /하트 리액션/ })
      expect(react).toHaveTextContent('2')
      fireEvent.click(react)
      expect(p.onReact).toHaveBeenCalledTimes(1)
    })
    it('닫기 버튼 → onClose', () => {
      const p = base()
      render(<PlaceDetail {...p} />)
      fireEvent.click(screen.getByRole('button', { name: '닫기' }))
      expect(p.onClose).toHaveBeenCalledTimes(1)
    })
    it('길찾기 버튼은 없다(spec §3.6 #5 제거)', () => {
      render(<PlaceDetail {...base()} />)
      expect(screen.queryByRole('button', { name: /길찾기/ })).toBeNull()
    })
  })
  ```
- [ ] Run `npm run test -- src/__tests__/placeDetail.test.tsx` (expected FAIL — module missing).
- [ ] Create `PlaceDetail.tsx`. Uses `markerVisual` for glyph + status text; focus moves to the panel on mount via a ref; `aria-live="polite"`; no directions button; visited is a clear React toggle:
  ```tsx
  import { useEffect, useRef } from 'react'
  import { markerVisual } from '@/lib/places/markerVisual'
  import type { WithWish } from '@/lib/places/wishStatus'
  import type { PlaceRow } from '@/hooks/usePlaces'
  import styles from './PlaceDetail.module.css'

  // 선택된 저장 장소의 상세(말풍선→시트 React 전환, spec §2/§3.6). 이름·상태(글리프+텍스트)·
  // 카테고리/지역 + 액션(가봤어요 토글 · ❤️ 리액션 · 닫기). 길찾기 없음(#5). 포커스 이동 + aria-live.
  export function PlaceDetail({
    place, visited, didIReact, reactionCount, busy,
    onVisit, onUnvisit, onReact, onClose,
  }: {
    place: WithWish<PlaceRow>
    visited: boolean
    didIReact: boolean
    reactionCount: number
    busy: boolean
    onVisit: () => void
    onUnvisit: () => void
    onReact: () => void
    onClose: () => void
  }) {
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
      ref.current?.focus()
    }, [place.id])
    const visual = markerVisual({ visited, bothWished: place.wish.bothWished, name: place.name })
    const statusText = visual.kind === 'visited' ? '가봤음' : visual.kind === 'both' ? '둘 다 찜' : '가고싶음'
    const meta = [place.category, place.region_label].filter((x): x is string => Boolean(x)).join(' · ')
    const heart = didIReact ? '❤️' : '🤍'
    return (
      <div ref={ref} className={styles.detail} tabIndex={-1} aria-label="장소 상세" aria-live="polite">
        <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">
          ✕
        </button>
        <div className={styles.head}>
          <span className={styles.glyph} aria-hidden>{visual.glyph}</span>
          <span className={styles.name}>{place.name}</span>
        </div>
        <div className={styles.sub}>
          <span className={styles.status}>{statusText}</span>
          {meta ? <span className={styles.meta}>{meta}</span> : null}
        </div>
        <div className={styles.actions}>
          {visited ? (
            <button
              type="button"
              className={`${styles.action} ${styles.actionDone}`}
              onClick={onUnvisit}
              disabled={busy}
              aria-pressed={true}
              aria-label={`${place.name} 가봤음 기록 취소`}
            >
              ✅ 가봤음 (취소)
            </button>
          ) : (
            <button
              type="button"
              className={styles.action}
              onClick={onVisit}
              disabled={busy}
              aria-pressed={false}
              aria-label={`${place.name} 다녀왔어요`}
            >
              ✅ 다녀왔어요
            </button>
          )}
          <button
            type="button"
            className={styles.action}
            onClick={onReact}
            disabled={busy}
            aria-pressed={didIReact}
            aria-label={`${place.name} 하트 리액션 (총 ${reactionCount}개)`}
          >
            {heart}{reactionCount > 0 ? ` ${reactionCount}` : ''}
          </button>
        </div>
      </div>
    )
  }
  ```
- [ ] Create `PlaceDetail.module.css` by porting the InfoWindow classes (dossier 03 §2 — `.bubble`→`.detail` flat, `.close`, `.head`, `.glyph`, `.name`, `.sub`, `.status`, `.meta`, `.actions`, `.action`). Critically, `.actionDone` keeps color+weight but DROPS the false `opacity:0.7; cursor:default` (it's a real toggle now — spec §3.6 fake-disabled removal):
  ```css
  .detail {
    position: relative;
    background: var(--c-surface);
    color: var(--c-text);
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    padding: var(--sp-3);
    margin-bottom: var(--sp-3);
  }
  .close {
    position: absolute;
    top: var(--sp-1);
    right: var(--sp-1);
    width: 44px;
    height: 44px;
    border: none;
    background: transparent;
    color: var(--c-text-weak);
    cursor: pointer;
    font-size: 0.9rem;
    line-height: 1;
  }
  .head { display: flex; align-items: center; gap: var(--sp-2); padding-right: var(--sp-6); }
  .glyph { font-size: 1.1rem; color: var(--c-brand); }
  .name { font-weight: 700; }
  .sub { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-1); font-size: var(--fs-caption); color: var(--c-text-weak); flex-wrap: wrap; }
  .status { font-weight: 600; color: var(--c-brand); }
  .meta { overflow: hidden; text-overflow: ellipsis; }
  .actions { display: flex; gap: var(--sp-2); margin-top: var(--sp-3); }
  .action {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border: 1px solid var(--c-border);
    background: var(--c-surface);
    color: var(--c-text);
    border-radius: 999px;
    padding: var(--sp-2) var(--sp-1);
    font-size: var(--fs-caption);
    cursor: pointer;
    min-height: 44px;
    white-space: nowrap;
  }
  /* 가봤음 — 색+텍스트 상태 표시(§8). 허위 disabled(opacity/cursor) 제거: 정상 토글. */
  .actionDone { color: var(--c-success); font-weight: 600; }
  ```
- [ ] Run `npm run test -- src/__tests__/placeDetail.test.tsx` (expected PASS).
- [ ] Run `npm run typecheck` (expected PASS) and `npm run build` (expected PASS).
- [ ] Commit:
  ```
  feat(map): 선택 장소 시트 상세 PlaceDetail(React) — 상태·가봤어요 토글·❤️

  말풍선 HTML 대신 React 컴포넌트로 상세를 렌더(포커스 이동·aria-live·키보드).
  길찾기 제거(#5), 허위 disabled 제거(정상 토글), markerVisual로 글리프 도출.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

### Task 10: PlacePreviewDetail component (unsaved search hit)

**Files:**
- Create: `/Users/minje/Project/love_place/src/components/places/PlacePreviewDetail.tsx`
- Create: `/Users/minje/Project/love_place/src/components/places/PlacePreviewDetail.module.css`
- Create: `/Users/minje/Project/love_place/src/__tests__/placePreviewDetail.test.tsx`

- [ ] Write failing tests (name/category/address + 저장 + 닫기; no directions):
  ```tsx
  import { describe, it, expect, vi } from 'vitest'
  import { render, screen, fireEvent } from '@testing-library/react'
  import { PlacePreviewDetail } from '@/components/places/PlacePreviewDetail'
  import type { KakaoPlaceHit } from '@/lib/kakao/types'

  const hit: KakaoPlaceHit = { kakaoPlaceId: 'k1', name: '속초 "칠성조선소', address: '강원 속초시', lat: 38, lng: 128.5, category: '카페', placeUrl: 'https://x' }

  describe('PlacePreviewDetail (미저장 검색 후보 — 시트 프리뷰)', () => {
    it('이름·카테고리·주소 표시 + [저장] → onSave', () => {
      const onSave = vi.fn()
      render(<PlacePreviewDetail hit={hit} saving={false} onSave={onSave} onClose={() => {}} />)
      expect(screen.getByText('속초 "칠성조선소')).toBeInTheDocument()
      expect(screen.getByText(/카페/)).toBeInTheDocument()
      expect(screen.getByText(/강원 속초시/)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /저장/ }))
      expect(onSave).toHaveBeenCalledTimes(1)
    })
    it('닫기 → onClose', () => {
      const onClose = vi.fn()
      render(<PlacePreviewDetail hit={hit} saving={false} onSave={() => {}} onClose={onClose} />)
      fireEvent.click(screen.getByRole('button', { name: '닫기' }))
      expect(onClose).toHaveBeenCalledTimes(1)
    })
    it('길찾기 버튼은 없다(spec §3.6 #5 제거)', () => {
      render(<PlacePreviewDetail hit={hit} saving={false} onSave={() => {}} onClose={() => {}} />)
      expect(screen.queryByRole('button', { name: /길찾기/ })).toBeNull()
    })
  })
  ```
- [ ] Run `npm run test -- src/__tests__/placePreviewDetail.test.tsx` (expected FAIL).
- [ ] Create `PlacePreviewDetail.tsx`:
  ```tsx
  import { useEffect, useRef } from 'react'
  import type { KakaoPlaceHit } from '@/lib/kakao/types'
  import styles from './PlacePreviewDetail.module.css'

  // 미저장 검색 후보의 시트 프리뷰(spec §3.6). 이름·카테고리·주소 + [저장]/[닫기]. 길찾기 없음(#5).
  export function PlacePreviewDetail({
    hit, saving, onSave, onClose,
  }: {
    hit: KakaoPlaceHit
    saving: boolean
    onSave: () => void
    onClose: () => void
  }) {
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
      ref.current?.focus()
    }, [hit.kakaoPlaceId])
    const meta = [hit.category, hit.address].filter((x): x is string => Boolean(x)).join(' · ')
    return (
      <div ref={ref} className={styles.detail} tabIndex={-1} aria-label="검색 결과 미리보기" aria-live="polite">
        <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">✕</button>
        <div className={styles.head}>
          <span className={styles.glyph} aria-hidden>＋</span>
          <span className={styles.name}>{hit.name}</span>
        </div>
        {meta ? <div className={styles.sub}><span className={styles.meta}>{meta}</span></div> : null}
        <div className={styles.actions}>
          <button type="button" className={styles.save} onClick={onSave} disabled={saving} aria-label={`${hit.name} 저장`}>
            ⭐ 저장
          </button>
        </div>
      </div>
    )
  }
  ```
- [ ] Create `PlacePreviewDetail.module.css` (same structure as PlaceDetail's; `.save` uses CTA tokens):
  ```css
  .detail { position: relative; background: var(--c-surface); color: var(--c-text); border: 1px solid var(--c-border); border-radius: var(--radius); padding: var(--sp-3); margin-bottom: var(--sp-3); }
  .close { position: absolute; top: var(--sp-1); right: var(--sp-1); width: 44px; height: 44px; border: none; background: transparent; color: var(--c-text-weak); cursor: pointer; font-size: 0.9rem; line-height: 1; }
  .head { display: flex; align-items: center; gap: var(--sp-2); padding-right: var(--sp-6); }
  .glyph { font-size: 1.1rem; color: var(--c-cta-bg); font-weight: 700; }
  .name { font-weight: 700; }
  .sub { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-1); font-size: var(--fs-caption); color: var(--c-text-weak); flex-wrap: wrap; }
  .meta { overflow: hidden; text-overflow: ellipsis; }
  .actions { display: flex; gap: var(--sp-2); margin-top: var(--sp-3); }
  .save { flex: 1; border: none; background: var(--c-cta-bg); color: var(--c-cta-fg); border-radius: 999px; padding: var(--sp-2) var(--sp-1); font-size: var(--fs-caption); cursor: pointer; min-height: 44px; font-weight: 600; }
  .save:disabled { opacity: 0.6; cursor: default; }
  ```
- [ ] Run `npm run test -- src/__tests__/placePreviewDetail.test.tsx` (expected PASS).
- [ ] Run `npm run typecheck` (expected PASS) and `npm run build` (expected PASS).
- [ ] Commit:
  ```
  feat(map): 미저장 후보 시트 프리뷰 PlacePreviewDetail(이름·카테고리·주소·저장)

  검색 프리뷰 말풍선을 시트 React 컴포넌트로 전환(포커스·aria-live).
  길찾기 제거(#5), 저장만 노출.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

### Task 11: Host detail/preview in PlaceSheet; thread props from MapPage

**Files:**
- Modify: `/Users/minje/Project/love_place/src/components/places/PlaceSheet.tsx` (props + body)
- Modify: `/Users/minje/Project/love_place/src/pages/MapPage.tsx` (pass previewHit + handlers; rewire)
- Modify: `/Users/minje/Project/love_place/src/__tests__/placeSheet.test.tsx` (new props in renderSheet)

- [ ] Extend `renderSheet` defaults in `placeSheet.test.tsx` with the new optional props so existing tests still compile, and add a test that selecting a place shows `PlaceDetail` in the sheet body:
  ```ts
  // in renderSheet props default:
  previewHit: null,
  reactions: {},
  onSave: () => {},
  onCloseDetail: () => {},
  ```
  ```ts
  it('selectedId가 있으면 시트 상단에 PlaceDetail(상세)을 표시한다', () => {
    const place = { id: 'p1', name: '칠성조선소', address: '속초', region_label: '속초', lat: 38, lng: 128, category: '카페', kakao_place_id: 'k1', added_by: 'u1', version: 1, wish: { wishedByMe: true, wishedByPartner: false, bothWished: false, wishCount: 1, totalPriority: 0, maxPriority: 0 } }
    renderSheet({ places: [place], selectedId: 'p1' })
    expect(screen.getByLabelText('장소 상세')).toBeInTheDocument()
    expect(screen.getByText('칠성조선소')).toBeInTheDocument()
  })
  ```
- [ ] Run `npm run test -- src/__tests__/placeSheet.test.tsx` (expected FAIL — sheet doesn't render PlaceDetail yet).
- [ ] DATA-FLOW for this task (explicit, to avoid a dangling double-state between Task 11 and Task 12): in the CURRENT code `MapPage` already passes `reactions={reactions}` and `previewHit={previewHit}` to `<NaverMap>` (MapPage.tsx lines 129/131) and owns `useToggleReaction(coupleId, myId)` (line 58, used in `onAction`). In Task 11, leave ALL of that in place — `NaverMap` keeps receiving `previewHit`/`selectedId` (for marker rendering) and `reactions`, and the MapPage-owned `useToggleReaction` stays. PlaceSheet gets its OWN `useToggleReaction(coupleId, myId, conflict.flag)` and a NEW `reactions` prop. So between Task 11 and Task 12 there are intentionally two `useToggleReaction` instances and `reactions` flows to both `NaverMap` and `PlaceSheet`; Task 12 then removes the MapPage-owned `useToggleReaction`/`onAction` and (since the InfoWindow that consumed reactions is gone) removes the `reactions={reactions}` prop from `<NaverMap>` — NaverMap no longer needs `reactions` after InfoWindow removal, leaving the sheet as the sole reactions consumer.
- [ ] In `PlaceSheet.tsx`, add props `previewHit: KakaoPlaceHit | null`, `reactions: ReactionMap | undefined`, `onSave: () => void`, `onCloseDetail: () => void`; import `PlaceDetail`, `PlacePreviewDetail`, `KakaoPlaceHit`, `ReactionMap`, `useToggleReaction`. Render the detail/preview at the top of `.body` driven by `previewHit ?? selectedId`. Use the sheet's existing `markVisited`/`unmarkVisited` mutations; reactions via a sheet-owned `useToggleReaction`. When `selectedId`/`previewHit` is set the existing `useEffect` already bumps peek→half:
  ```tsx
  // add to imports
  import { PlaceDetail } from '@/components/places/PlaceDetail'
  import { PlacePreviewDetail } from '@/components/places/PlacePreviewDetail'
  import { useToggleReaction, type ReactionMap } from '@/hooks/useReactions'
  import type { KakaoPlaceHit } from '@/lib/kakao/types'
  ```
  ```tsx
  // add to props/destructure
  previewHit,
  reactions,
  onSave,
  onCloseDetail,
  // : with types
  previewHit: KakaoPlaceHit | null
  reactions: ReactionMap | undefined
  onSave: () => void
  onCloseDetail: () => void
  ```
  ```tsx
  const toggleReaction = useToggleReaction(coupleId, myId, conflict.flag)
  const selectedPlace = selectedId ? places.find((p) => p.id === selectedId) ?? null : null
  ```
  At the very top of the `coupleActive` `.body` block (before `<ConflictBanner>`), insert:
  ```tsx
  {previewHit ? (
    <PlacePreviewDetail
      hit={previewHit}
      saving={false}
      onSave={onSave}
      onClose={onCloseDetail}
    />
  ) : selectedPlace ? (
    <PlaceDetail
      place={selectedPlace}
      visited={visitedIds.has(selectedPlace.id)}
      didIReact={reactions?.[selectedPlace.id]?.didIReact ?? false}
      reactionCount={reactions?.[selectedPlace.id]?.count ?? 0}
      busy={markVisited.isPending || unmarkVisited.isPending}
      onVisit={() => {
        if (!visitedIds.has(selectedPlace.id))
          markVisited.mutate({ placeId: selectedPlace.id }, { onSuccess: () => toast.show('가봤어요로 기록했어요 ✅') })
      }}
      onUnvisit={() =>
        unmarkVisited.mutate(
          { placeId: selectedPlace.id, visits },
          { onSuccess: (r) => { if (!r.conflicted) toast.show('가봤음 기록을 취소했어요') } },
        )
      }
      onReact={() => toggleReaction.mutate({ placeId: selectedPlace.id })}
      onClose={onCloseDetail}
    />
  ) : null}
  ```
  Also fix the existing `onUnvisit` PlaceList callback to honor `{conflicted}` (P4 returns it): `onSuccess: (r) => { if (!r.conflicted) toast.show('가봤음 기록을 취소했어요') }`. (The `{conflicted}` return lands in Task 17; until then `r` is `void` and `r.conflicted` would not typecheck — so this exact `onSuccess` edit is deferred to Task 17. For now keep the existing `onSuccess: () => toast.show(...)`.)
- [ ] In `MapPage.tsx`, pass the new props to `<PlaceSheet>`: `previewHit={previewHit}`, `reactions={reactions}`, `onSave={() => onSheetSave()}`, `onCloseDetail={() => { setSelectedId(null); setPreviewHit(null) }}`. Add an `onSheetSave` that runs the same save logic as the (now removed) `onPreviewAction` save branch (will be finalized in Task 13). For now define:
  ```tsx
  const onSheetSave = () => {
    if (!previewHit) return
    savePlace.mutate(previewHit, {
      onSuccess: (r) => {
        setPreviewHit(null)
        if (r) setSelectedId(r.placeId)
        else toast.show('오프라인이라 큐에 담았어요 — 연결되면 저장돼요')
      },
      onError: (e) => toast.show(e.message, 3000),
    })
  }
  ```
- [ ] Run `npm run test -- src/__tests__/placeSheet.test.tsx` (expected PASS).
- [ ] Run `npm run typecheck` (expected PASS) and `npm run build` (expected PASS).
- [ ] Commit:
  ```
  feat(map): 시트가 selectedId/previewHit로 PlaceDetail/PreviewDetail 호스팅

  MapPage가 previewHit·reactions·onSave·onCloseDetail을 시트로 전달하고,
  시트 상단 고정 영역에 상세/프리뷰를 React로 렌더(말풍선 폐지 준비).

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

### Task 12: Remove ALL InfoWindow code from NaverMap + delete HTML builders + directions call sites

**Files:**
- Modify: `/Users/minje/Project/love_place/src/components/map/NaverMap.tsx` (delete list per dossier 02 §6)
- Modify: `/Users/minje/Project/love_place/src/lib/places/infoWindowHtml.ts` (keep `escapeHtml`, delete the two builders)
- Modify: `/Users/minje/Project/love_place/src/lib/places/selectedMarker.ts` (import escapeHtml — already does; no change unless import path)
- Delete: `/Users/minje/Project/love_place/src/__tests__/infoWindowHtml.test.ts`
- Delete: `/Users/minje/Project/love_place/src/__tests__/previewWindowHtml.test.ts`
- Modify: `/Users/minje/Project/love_place/src/pages/MapPage.tsx` (drop openDirections import + onAction/onPreviewAction directions branches)
- Modify: `/Users/minje/Project/love_place/src/__tests__/mapPagePreview.test.tsx` (drop onPreviewAction directions assertions if any; align to new wiring)

- [ ] In `infoWindowHtml.ts`, delete `infoWindowHtml` and `previewWindowHtml` functions; keep only `escapeHtml` (still used by `selectedMarker.ts`, cluster label, preview marker label — dossier 02 §3.1). The `import iwStyles from '@/components/map/InfoWindow.module.css'` line is now unused → remove it.
- [ ] Delete `src/__tests__/infoWindowHtml.test.ts` and `src/__tests__/previewWindowHtml.test.ts` (their assertions are replaced by `placeDetail.test.tsx`/`placePreviewDetail.test.tsx`):
  - `git rm src/__tests__/infoWindowHtml.test.ts src/__tests__/previewWindowHtml.test.ts`
- [ ] In `NaverMap.tsx`, apply the DELETE LIST (dossier 02 §6): remove `infoWindowHtml`/`previewWindowHtml` from the import (keep `escapeHtml`); remove `deriveWishStatus` import; delete `infoRef`/`infoHandlerRef`/`previewInfoRef`/`previewHandlerRef` refs; delete `onActionRef`/`onPreviewActionRef` mirrors; delete both `new nv.maps.InfoWindow(...)` constructions and their cleanup; delete the saved-InfoWindow re-anchor block inside `render()`; delete the entire single-InfoWindow content effect; in the preview effect delete only the InfoWindow lines (keep the preview Marker create/setPosition/panTo); drop `onAction`/`onPreviewAction` from the props type and destructure (selection→sheet now). Also drop the `reactions` prop from the props type and destructure: after InfoWindow removal NaverMap no longer reads `reactions` (it only fed the deleted InfoWindow content). Keep `onSelect`, `onClose`, `selectedId`, `previewHit`, `visitedIds`, `snap` (Task 8). Keep map-click→`onClose`, ESC→`onClose`, selection highlight effect, cluster render, places fitBounds fallback.
- [ ] In `MapPage.tsx`: remove `import { openDirections } from '@/lib/places/directionsUrl'`; delete the `directions` branch in `onAction` and remove `onAction`/`onPreviewAction` props from `<NaverMap>` (no longer accepted); also remove the `reactions={reactions}` prop from `<NaverMap>` (NaverMap no longer accepts it — reactions now flow only to PlaceSheet). `onAction`'s remaining `visit`/`unvisit`/`react` cases move to the sheet (Task 11 already handles them via PlaceDetail) — so `onAction` and `onPreviewAction` and the MapPage-owned `useToggleReaction` (line 58) plus any now-unused `markVisited`/`unmarkVisited` in MapPage can be deleted IF unused; verify by typecheck (`reactions` itself is still computed via `useReactions` and passed to PlaceSheet, so keep that). Keep `onSelect`/`onClose` wired to `setSelectedId`/`setPreviewHit`, and keep `snap={snap}` (Task 8).
- [ ] Update `mapPagePreview.test.tsx`: the NaverMap stub mock no longer needs `onPreviewAction`; the test now drives save through the sheet's `onSave`. Adjust the stub to expose `onSelect` only and assert preview→save via the path that still exists (or relax to assert `previewHit` is set on pick). Concretely, change the mocked NaverMap to drop `onPreviewAction` and keep `previewHit`/`selectedId`/`onSelect`; update the save assertions to target the sheet `onSave` (the test already stubs PlaceSheet — extend that stub to expose an `onSave` button):
  ```tsx
  vi.mock('@/components/places/PlaceSheet', () => ({
    PlaceSheet: (props: { previewHit: { kakaoPlaceId: string } | null; onSave: () => void }) => (
      <div data-testid="sheet">
        <div data-testid="sheet-preview">{props.previewHit?.kakaoPlaceId ?? 'none'}</div>
        <button onClick={props.onSave}>sheet-save</button>
      </div>
    ),
  }))
  ```
  Then assert: pick `new1` → `sheet-preview` shows `new1`; click `sheet-save` → `saveMutate` called.
- [ ] Run `npm run test -- src/__tests__/mapPagePreview.test.tsx` and `npm run test -- src/__tests__/mapSearchOverlay.test.tsx` (expected PASS).
- [ ] Run the full suite `npm run test` (expected PASS — deleted tests gone, no dangling imports).
- [ ] Run `npm run typecheck` (expected PASS) and `npm run build` (expected PASS).
- [ ] Commit:
  ```
  refactor(map): NaverMap에서 InfoWindow 일체 제거 + 말풍선 빌더·길찾기 호출부 삭제

  infoRef/previewInfoRef/위임 핸들러·재앵커·콘텐츠 effect 삭제, 프리뷰 마커만 유지.
  infoWindowHtml/previewWindowHtml 함수 삭제(escapeHtml 보존), 관련 테스트 대체.
  MapPage onAction/onPreviewAction·openDirections 호출부 제거(상세는 시트).

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

### Task 13: InfoWindow.module.css cleanup + finalize save wiring

**Files:**
- Delete: `/Users/minje/Project/love_place/src/components/map/InfoWindow.module.css`
- Modify: `/Users/minje/Project/love_place/src/pages/MapPage.tsx` (remove now-dead onPreviewAction; keep onSheetSave)
- Modify: `/Users/minje/Project/love_place/src/__tests__/mapPagePreview.test.tsx` (final assertions)

- [ ] Confirm no remaining imports of `InfoWindow.module.css` (it was only imported by the deleted `infoWindowHtml.ts` builders): `grep -rn "InfoWindow.module.css" src` → expect 0 matches. Then `git rm src/components/map/InfoWindow.module.css`.
- [ ] In `MapPage.tsx`, delete the now-unused `onPreviewAction` function entirely (save flows through `onSheetSave`/sheet). Ensure `onSheetSave` is the single save path and the `jumped` handling will be added in P6 (Task 22) — leave a clear in-function structure (do NOT leave a TODO comment; just the working online/offline branches from Task 11).
- [ ] Run `grep -rn "onPreviewAction\|previewWindowHtml\|infoWindowHtml(" src` → expect 0 matches.
- [ ] Run `npm run test` (expected PASS), `npm run typecheck` (expected PASS), `npm run build` (expected PASS).
- [ ] Run `npm run e2e` after `npm run build:e2e` (expected PASS; if selected-detail shot changed because detail now renders in the sheet, re-seed darwin baselines with `SEED_SNAPSHOT=1`).
- [ ] Commit:
  ```
  refactor(map): InfoWindow.module.css 삭제 + 저장 경로 단일화(onSheetSave)

  말풍선 CSS 모듈 미사용 → 제거, MapPage onPreviewAction 폐기.
  저장은 시트 프리뷰의 onSave 한 경로로 통일.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

## Phase P3: Empty / error states

### Task 14: Auto-open sheet to half on empty/disconnected/loading + loading peek summary

**Files:**
- Modify: `/Users/minje/Project/love_place/src/components/places/PlaceSheet.tsx` (auto-half effect + peek summary)
- Modify: `/Users/minje/Project/love_place/src/__tests__/placeSheet.test.tsx`

- [ ] Add failing tests: (a) when `places.length===0 && coupleActive` and not loading, the sheet auto-opens to half on mount; (b) peek summary shows '불러오는 중…' when `placesLoading` (not '0곳'):
  ```ts
  it('빈 상태(0곳·연결됨)면 마운트 시 시트가 half로 자동 오픈', () => {
    renderSheet({ places: [], coupleActive: true, placesLoading: false })
    // half면 핸들 aria-expanded=true
    expect(screen.getByRole('button', { name: /시트/ })).toHaveAttribute('aria-expanded', 'true')
  })
  it('로딩 중 peek 요약은 "불러오는 중…"(‘0곳’ 금지)', () => {
    renderSheet({ places: [], placesLoading: true })
    expect(screen.getByText(/불러오는 중…/)).toBeInTheDocument()
    expect(screen.queryByText('우리 장소 0곳')).toBeNull()
  })
  ```
- [ ] Run `npm run test -- src/__tests__/placeSheet.test.tsx` (expected FAIL).
- [ ] In `PlaceSheet.tsx`, add an auto-half effect (mirrors the existing selectedId→half pattern) that fires once when there is nothing to show:
  ```tsx
  // 빈/미연결/로딩이면 첫 화면이 죽지 않게 half로 자동 오픈(spec §3.3). peek에서만(사용자 펼침 존중).
  const autoHalfRef = useRef(false)
  useEffect(() => {
    if (autoHalfRef.current) return
    const nothingToShow = !coupleActive || placesLoading || places.length === 0
    if (nothingToShow && snap === 'peek') {
      autoHalfRef.current = true
      setSnap('half')
    }
  }, [coupleActive, placesLoading, places.length, snap])
  ```
  Change the summary span to reflect loading:
  ```tsx
  <span className={styles.summary}>
    {placesLoading ? '불러오는 중…' : `우리 장소 ${places.length}곳`}
  </span>
  ```
- [ ] Run `npm run test -- src/__tests__/placeSheet.test.tsx` (expected PASS).
- [ ] Run `npm run typecheck` (expected PASS), `npm run build` (expected PASS).
- [ ] Commit:
  ```
  feat(map): 빈/미연결/로딩 시 시트 자동 half + peek 요약 로딩 문구

  첫 화면이 죽어 보이지 않게 마운트 시 half로 오픈하고, 로딩 중 peek 요약을
  '0곳' 대신 '불러오는 중…'으로 표시(spec §3.3).

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

### Task 15: EmptyState action buttons (focus search / link to /us) + gate PlaceSheet on isNaverMapConfigured

**Files:**
- Modify: `/Users/minje/Project/love_place/src/components/places/PlaceSheet.tsx` (EmptyState `action`)
- Modify: `/Users/minje/Project/love_place/src/pages/MapPage.tsx` (gate PlaceSheet render)
- Modify: `/Users/minje/Project/love_place/src/__tests__/placeSheet.test.tsx`

- [ ] Add failing test: not-connected EmptyState renders an action link to `/us`:
  ```ts
  it('미연결 빈 상태에 /us로 가는 액션 버튼이 있다', () => {
    // PlaceSheet의 미연결 EmptyState는 Router 컨텍스트가 필요 → MemoryRouter로 감싸 렌더.
    renderSheet({ coupleActive: false })
    expect(screen.getByRole('link', { name: /우리 탭에서 연결/ })).toHaveAttribute('href', '/us')
  })
  ```
  Wrap `renderSheet` in `MemoryRouter` (add `import { MemoryRouter } from 'react-router-dom'` and wrap the existing render tree once).
- [ ] Run `npm run test -- src/__tests__/placeSheet.test.tsx` (expected FAIL).
- [ ] In `PlaceSheet.tsx`, import `Link` from `react-router-dom`, and pass `action` to the not-connected EmptyState:
  ```tsx
  <EmptyState
    emoji="💑"
    title="먼저 상대와 연결해요"
    hint="'우리' 탭에서 초대 코드로 연결하면, 둘이 함께 장소를 모을 수 있어요."
    action={
      <Link className={styles.emptyAction} to="/us">
        우리 탭에서 연결하기
      </Link>
    }
  />
  ```
  Add `.emptyAction` to `PlaceSheet.module.css` (button-like link, CTA tokens, ≥44px):
  ```css
  .emptyAction {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: var(--sp-2) var(--sp-4);
    border-radius: 999px;
    background: var(--c-cta-bg);
    color: var(--c-cta-fg);
    font-weight: 600;
    text-decoration: none;
  }
  ```
- [ ] In `MapPage.tsx`, gate `<PlaceSheet>` on `isNaverMapConfigured()` so the key-missing path shows a single '준비 중' message (the existing `🗺️ 지도 준비 중이에요` EmptyState), not two empty states:
  ```tsx
  {isNaverMapConfigured() ? (
    <PlaceSheet
      /* ...existing props... */
    />
  ) : null}
  ```
- [ ] Run `npm run test -- src/__tests__/placeSheet.test.tsx` (expected PASS).
- [ ] Run `npm run typecheck` (expected PASS), `npm run build` (expected PASS).
- [ ] Commit:
  ```
  feat(map): 빈 상태 액션 버튼(/us 연결) + 키 없을 때 시트 미렌더(단일 안내)

  미연결 EmptyState에 /us 링크 액션을 추가하고, isNaverMapConfigured()가
  false면 PlaceSheet를 렌더하지 않아 '준비 중' 안내 1개만 보이게 한다(spec §3.3).

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

### Task 16: NaverMap load-error retry

**Files:**
- Modify: `/Users/minje/Project/love_place/src/components/map/NaverMap.tsx` (error fallback + retry)
- Modify: `/Users/minje/Project/love_place/src/components/map/NaverMap.module.css` (.retryBtn)

- [ ] In `NaverMap.tsx`, refactor the load effect so it can be re-run, and add a retry button to the error fallback. Introduce a `loadKey` state bumped on retry, and a `retry` handler that clears the error + cached loader promise is not resettable, so retry simply re-attempts init by remounting the effect via `loadKey`. Implement:
  - Add `const [loadKey, setLoadKey] = useState(0)` and add `loadKey` to the init effect deps.
  - On retry: `setError(null); setReady(false); setLoadKey((k) => k + 1)`.
  - Update the error return:
  ```tsx
  if (error) {
    return (
      <div className={styles.fallback} role="alert">
        <p>지도를 불러오지 못했어요.</p>
        <p className={styles.fallbackHint}>{error}</p>
        <button type="button" className={styles.retryBtn} onClick={() => { setError(null); setReady(false); setLoadKey((k) => k + 1) }}>
          다시 시도
        </button>
      </div>
    )
  }
  ```
  NOTE: `loadNaverMaps()` memoizes its promise; if the first load failed because the script never set `window.naver`, retry re-calls the same rejected promise. To make retry effective, guard: in the init effect, if `window.naver?.maps` already exists, build the map directly; otherwise call `loadNaverMaps()`. This makes retry succeed once the network/script recovers within the same session. Add `.async` handling already present.
- [ ] Add `.retryBtn` to `NaverMap.module.css`:
  ```css
  .retryBtn {
    margin-top: var(--sp-2);
    min-height: 44px;
    padding: var(--sp-2) var(--sp-4);
    border-radius: 999px;
    border: 1px solid var(--c-border);
    background: var(--c-surface);
    color: var(--c-text);
    cursor: pointer;
  }
  ```
- [ ] Run `npm run typecheck` (expected PASS), `npm run build` (expected PASS), `npm run test` (expected PASS — no test regressions).
- [ ] Commit:
  ```
  feat(map): 지도 로드 실패 시 재시도 버튼(로딩/에러 디테일)

  error 폴백에 '다시 시도'를 추가하고 loadKey로 init effect를 재실행해
  스크립트/네트워크 회복 시 재로드 가능하게 한다(ux §7 에러 상태).

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

## Phase P4: Sync integrity

### Task 17: useUnmarkVisited returns {conflicted}; toast only when !conflicted (both surfaces); drop ['places'] invalidation

**Files:**
- Modify: `/Users/minje/Project/love_place/src/hooks/useVisits.ts` (useUnmarkVisited type/return; both onSuccess invalidations)
- Modify: `/Users/minje/Project/love_place/src/components/places/PlaceSheet.tsx` (onUnvisit toast guard — both PlaceList + PlaceDetail)
- Modify: `/Users/minje/Project/love_place/src/pages/MapPage.tsx` (any remaining unmarkVisited caller — removed in Task 12, verify)
- Modify: `/Users/minje/Project/love_place/src/__tests__/unmarkVisited.test.ts` (assert conflicted contract)

- [ ] Update `unmarkVisited.test.ts` to lock the `{conflicted}` contract via `interpretRows` (already covers ok/conflict) plus a new helper-shape assertion. Add:
  ```ts
  it('충돌 행이 하나라도 있으면 conflicted=true로 집계된다(계약)', () => {
    // 활성 방문행 2개 중 1개가 0행(conflict)이면 conflicted=true.
    const results = [interpretRows([{ id: 'v1' }]), interpretRows([])]
    const conflicted = results.some((r) => r.status === 'conflict')
    expect(conflicted).toBe(true)
  })
  ```
- [ ] Run `npm run test -- src/__tests__/unmarkVisited.test.ts` (expected PASS — pure helper; this documents the contract that the hook must now return).
- [ ] In `useVisits.ts`, change `useUnmarkVisited` mutation result type from `void` to `{ conflicted: boolean }`, `return { conflicted }`, and remove `['places', coupleId]` from BOTH `useMarkVisited.onSuccess` and `useUnmarkVisited.onSuccess`:
  ```ts
  export function useUnmarkVisited(coupleId: string | null, myId: string | null, onConflict: () => void) {
    const queryClient = useQueryClient()
    return useMutation<{ conflicted: boolean }, Error, { placeId: string; visits: VisitRow[] }>({
      mutationFn: async ({ placeId, visits }) => {
        if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
        const active = visits.filter((v) => v.place_id === placeId)
        if (active.length === 0) return { conflicted: false }
        let conflicted = false
        for (const v of active) {
          const res = await softDelete('visits', v.id, v.version, myId)
          if (res.status === 'conflict') conflicted = true
        }
        if (conflicted) onConflict()
        return { conflicted }
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['visits', coupleId] })
      },
    })
  }
  ```
  And `useMarkVisited.onSuccess` keeps only `['visits', coupleId]`.
- [ ] In `PlaceSheet.tsx`, update BOTH unvisit callers to suppress success toast on conflict:
  - PlaceList `onUnvisit`: `onSuccess: (r) => { if (!r.conflicted) toast.show('가봤음 기록을 취소했어요') }`
  - PlaceDetail `onUnvisit` (added Task 11): same guard.
- [ ] Verify MapPage has no remaining `unmarkVisited` caller (removed in Task 12): `grep -n "unmarkVisited" src/pages/MapPage.tsx` → expect 0.
- [ ] Run `npm run test` (expected PASS), `npm run typecheck` (expected PASS), `npm run build` (expected PASS).
- [ ] Commit:
  ```
  fix(sync): 가봤음 취소가 {conflicted} 반환 → 충돌 시 성공 토스트 억제 + ['places'] 무효화 제거

  useUnmarkVisited가 conflicted를 반환하고 카드/시트 상세 양쪽이 !conflicted일 때만
  토스트. 방문 상태는 ['visits']에서 도출되므로 visit mutation의 ['places'] 무효화 제거.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

### Task 18: un-react via versioned soft-delete; useMarkVisited no-op if visited

**Files:**
- Modify: `/Users/minje/Project/love_place/src/hooks/useReactions.ts` (useToggleReaction onConflict param + versioned soft-delete)
- Modify: `/Users/minje/Project/love_place/src/hooks/useVisits.ts` (useMarkVisited no-op guard + `alreadyVisited` variable)
- Modify: `/Users/minje/Project/love_place/src/components/places/PlaceList.tsx` (line 11 `MarkVisited` type alias + line ~125 `markVisited.mutate` call site)
- Modify: `/Users/minje/Project/love_place/src/pages/MapPage.tsx` + `/Users/minje/Project/love_place/src/components/places/PlaceSheet.tsx` (pass conflict.flag to useToggleReaction; pass alreadyVisited to markVisited)
- Create: `/Users/minje/Project/love_place/src/__tests__/toggleReaction.test.ts`
- Modify: `/Users/minje/Project/love_place/src/__tests__/mapPagePreview.test.tsx` (useToggleReaction signature mock)

- [ ] Write a failing pure-contract test for un-react versioning (mirror `unmarkVisited.test.ts` style — assert via `interpretRows` that un-react uses the versioned path; the hook must select `id, version` and call `softDelete`):
  ```ts
  import { describe, it, expect } from 'vitest'
  import { interpretRows } from '@/lib/sync/versionedUpdate'

  // 리액션 취소는 LWW 평문 update가 아니라 version 조건부 softDelete(0행=충돌)여야 한다.
  describe('❤️ 리액션 취소 — version 조건부 soft-delete 계약', () => {
    it('softDelete 1행=ok(취소 성공)', () => {
      expect(interpretRows([{ id: 'r1' }]).status).toBe('ok')
    })
    it('softDelete 0행=conflict(상대가 먼저 변경) — 무음 덮어쓰기 금지', () => {
      expect(interpretRows([]).status).toBe('conflict')
    })
  })
  ```
- [ ] Run `npm run test -- src/__tests__/toggleReaction.test.ts` (expected PASS — pure contract).
- [ ] In `useReactions.ts`, add `onConflict: () => void` param to `useToggleReaction`, select `id, version` in the `mine` query, and replace the plain `.update({deleted_at})` with `softDelete('reactions', id, version, myId)` surfacing conflict (dossier 04 §B.2 THE BUG):
  ```ts
  import { softDelete } from '@/lib/sync/versionedUpdate'
  // ...
  export function useToggleReaction(coupleId: string | null, myId: string | null, onConflict: () => void) {
    const queryClient = useQueryClient()
    return useMutation<void, Error, { placeId: string }>({
      mutationFn: async ({ placeId }) => {
        if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
        const { data: mine, error: selErr } = await supabase
          .from('reactions')
          .select('id, version')
          .eq('couple_id', coupleId)
          .eq('target_type', 'PLACE')
          .eq('target_id', placeId)
          .eq('user_id', myId)
          .is('deleted_at', null)
          .limit(1)
        if (selErr) throw new Error(selErr.message)
        const existing = mine?.[0]
        if (existing) {
          const res = await softDelete('reactions', existing.id as string, existing.version as number, myId)
          if (res.status === 'conflict') onConflict()
        } else {
          const { error } = await supabase.from('reactions').insert({
            couple_id: coupleId, user_id: myId, target_type: 'PLACE', target_id: placeId,
            emoji: '❤️', created_by: myId, updated_by: myId,
          })
          if (error) throw new Error(error.message)
        }
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['reactions', coupleId] })
      },
    })
  }
  ```
- [ ] In `useVisits.ts`, make `useMarkVisited` no-op if already visited by accepting `alreadyVisited` in the mutation variables and early-returning:
  ```ts
  return useMutation<void, Error, { placeId: string; visitDate?: string; alreadyVisited?: boolean }>({
    mutationFn: async ({ placeId, visitDate, alreadyVisited }) => {
      if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
      if (alreadyVisited) return // 중복 방문 insert 방지(spec §3.4)
      const { error } = await supabase.from('visits').insert({ /* ...unchanged... */ })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['visits', coupleId] }) },
  })
  ```
- [ ] Update the shared `MarkVisited` type alias so the new `alreadyVisited` variable typechecks across the prop boundary. In `PlaceList.tsx` line 11, the alias `type MarkVisited = UseMutationResult<void, Error, { placeId: string; visitDate?: string }>` is used as the `markVisited` prop type (also threaded into PlaceSheet/PlaceDetail). Without updating it, `markVisited.mutate({ placeId, alreadyVisited })` will not typecheck. Change it to:
  ```ts
  type MarkVisited = UseMutationResult<void, Error, { placeId: string; visitDate?: string; alreadyVisited?: boolean }>
  ```
- [ ] Update callers:
  - `PlaceList.tsx` line ~125: change `markVisited.mutate({ placeId: p.id }, { onSuccess: () => onToast('가봤어요로 기록했어요 ✅') })` to `markVisited.mutate({ placeId: p.id, alreadyVisited: visitedIds.has(p.id) }, { onSuccess: () => onToast('가봤어요로 기록했어요 ✅') })` (PlaceList already receives `visitedIds`).
  - `PlaceSheet.tsx`: the sheet-owned `useToggleReaction(coupleId, myId, conflict.flag)` (Task 11 used 2 args — change to 3). PlaceDetail's `onVisit` passes `alreadyVisited: visitedIds.has(selectedPlace.id)`.
  - `mapPagePreview.test.tsx`: the mocked `useToggleReaction` already returns `{ mutate }` ignoring args — no change, but confirm the mock signature accepts 3 args (it does — arrow ignores extras).
- [ ] Run `npm run test` (expected PASS), `npm run typecheck` (expected PASS), `npm run build` (expected PASS).
- [ ] Commit:
  ```
  fix(sync): 리액션 취소 version 조건부 soft-delete + 중복 방문 insert 가드

  useToggleReaction이 id+version을 읽어 softDelete로 끄고 충돌을 배너로 표시(LWW 제거).
  useMarkVisited는 alreadyVisited면 no-op(더블탭 중복 행 방지).

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

### Task 19: Offline queue kinds visit.add / visit.remove / reaction.toggle

**Files:**
- Modify: `/Users/minje/Project/love_place/src/state/offlineExecutor.ts` (OutboxKind + payloads + cases)
- Modify: `/Users/minje/Project/love_place/src/state/OfflineQueueProvider.tsx` (post-flush invalidate ['visits'], ['reactions'])
- Modify: `/Users/minje/Project/love_place/src/hooks/useVisits.ts` + `/Users/minje/Project/love_place/src/hooks/useReactions.ts` (enqueue when offline)
- Modify: `/Users/minje/Project/love_place/src/__tests__/offlineQueue.test.ts` (new-kind replay test)

- [ ] Add a failing test in `offlineQueue.test.ts` for the new executor kinds via a fake executor proving dedupeKey collapse + flush order for `reaction.toggle`/`visit.add`/`visit.remove`. Use the existing memory-store pattern in that file (append a describe block):
  ```ts
  // (append) 새 종류(visit/reaction)도 dedupeKey로 마지막 의도만 유지되고 ok면 큐에서 제거된다.
  it('reaction.toggle/visit.add는 dedupeKey로 같은 placeId 중복을 1건으로 접는다', async () => {
    const { OfflineQueue } = await import('@/state/offlineQueue')
    const { createMemoryStore } = await import('@/state/outboxStore')
    const q = new OfflineQueue(createMemoryStore(), { now: () => 1, genId: (() => { let i = 0; return () => `id${i++}` })() })
    await q.enqueue('reaction.toggle', { placeId: 'p1' }, 'reaction.toggle:p1')
    await q.enqueue('reaction.toggle', { placeId: 'p1' }, 'reaction.toggle:p1')
    expect(await q.pending()).toBe(1)
    const res = await q.flush(async () => 'ok')
    expect(res.done).toBe(1)
    expect(res.remaining).toBe(0)
  })
  ```
- [ ] Run `npm run test -- src/__tests__/offlineQueue.test.ts` (expected PASS — queue is generic; this locks dedupe behavior the hooks will rely on).
- [ ] In `offlineExecutor.ts`, extend `OutboxKind`, add payload types, and add three cases. For `reaction.toggle` re-query at replay (safer per dossier 04 §C.1); for `visit.add` re-check existing active visit (idempotent replay); for `visit.remove` loop softDelete:
  ```ts
  import { supabase } from '@/lib/supabase/client'
  // ...
  export type OutboxKind =
    | 'wish.setPriority' | 'place.delete' | 'place.restore' | 'place.save'
    | 'visit.add' | 'visit.remove' | 'reaction.toggle'

  type VisitAddPayload = { coupleId: string; placeId: string; visitDate: string; myId: string }
  type VisitRemovePayload = { visits: { id: string; version: number }[]; myId: string }
  type ReactionTogglePayload = { coupleId: string; placeId: string; myId: string }
  ```
  Add cases inside the switch:
  ```ts
    case 'visit.add': {
      const p = entry.payload as VisitAddPayload
      // 재생 안전: 이미 활성 방문행이 있으면 no-op(중복 insert 방지).
      const { data: existing } = await supabase
        .from('visits').select('id').eq('couple_id', p.coupleId).eq('place_id', p.placeId).is('deleted_at', null).limit(1)
      if (existing && existing.length > 0) return 'ok'
      const { error } = await supabase.from('visits').insert({
        couple_id: p.coupleId, place_id: p.placeId, visit_date: p.visitDate, created_by: p.myId, updated_by: p.myId,
      })
      if (error) throw new Error(error.message)
      return 'ok'
    }
    case 'visit.remove': {
      const p = entry.payload as VisitRemovePayload
      let conflicted = false
      for (const v of p.visits) {
        const r = await softDelete('visits', v.id, v.version, p.myId)
        if (r.status === 'conflict') conflicted = true
      }
      return conflicted ? 'conflict' : 'ok'
    }
    case 'reaction.toggle': {
      const p = entry.payload as ReactionTogglePayload
      const { data: mine } = await supabase
        .from('reactions').select('id, version').eq('couple_id', p.coupleId).eq('target_type', 'PLACE')
        .eq('target_id', p.placeId).eq('user_id', p.myId).is('deleted_at', null).limit(1)
      const existing = mine?.[0]
      if (existing) return (await softDelete('reactions', existing.id as string, existing.version as number, p.myId)).status
      const { error } = await supabase.from('reactions').insert({
        couple_id: p.coupleId, user_id: p.myId, target_type: 'PLACE', target_id: p.placeId,
        emoji: '❤️', created_by: p.myId, updated_by: p.myId,
      })
      if (error) throw new Error(error.message)
      return 'ok'
    }
  ```
- [ ] In `OfflineQueueProvider.tsx`, add `['visits']` and `['reactions']` to the post-flush invalidation list (dossier 04 §C.2 caveat):
  ```ts
  void queryClient.invalidateQueries({ queryKey: ['places'] })
  void queryClient.invalidateQueries({ queryKey: ['wishes'] })
  void queryClient.invalidateQueries({ queryKey: ['placesTrash'] })
  void queryClient.invalidateQueries({ queryKey: ['visits'] })
  void queryClient.invalidateQueries({ queryKey: ['reactions'] })
  ```
- [ ] Wire the hooks to enqueue when offline (mirror `useSavePlace` precedent, dossier 04 §F). `useMarkVisited`, `useUnmarkVisited`, `useToggleReaction` import `useOfflineQueue` and, when `!navigator.onLine`, `enqueue(...)` with dedupeKey `<kind>:<placeId>` then return early:
  - `useMarkVisited` offline: `await enqueue('visit.add', { coupleId, placeId, visitDate: visitDate ?? dayKey(...), myId }, `visit.add:${placeId}`); return`
  - `useUnmarkVisited` offline: snapshot active rows → `await enqueue('visit.remove', { visits: active.map(v=>({id:v.id,version:v.version})), myId }, `visit.remove:${placeId}`); return { conflicted: false }`
  - `useToggleReaction` offline: `await enqueue('reaction.toggle', { coupleId, placeId, myId }, `reaction.toggle:${placeId}`); return`
  Each hook now also calls `useOfflineQueue()` at the top.
- [ ] Run `npm run test` (expected PASS), `npm run typecheck` (expected PASS), `npm run build` (expected PASS).
- [ ] Commit:
  ```
  feat(sync): 방문/리액션 오프라인 큐(visit.add·visit.remove·reaction.toggle)

  offlineExecutor에 세 종류를 추가(재생 안전: visit.add 중복 가드, toggle 재조회)하고
  훅이 오프라인이면 dedupeKey로 적재, flush 후 ['visits']/['reactions'] 무효화(유실 0).

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

## Phase P5: My-location

### Task 20: GeoResult accuracy + isSecureContext + permission gate (no auto-request on load)

**Files:**
- Modify: `/Users/minje/Project/love_place/src/lib/geo/currentPosition.ts` (accuracy + getPermissionState)
- Modify: `/Users/minje/Project/love_place/src/__tests__/currentPosition.test.ts` (accuracy + permission tests)

- [ ] Update `currentPosition.test.ts`: add `accuracy` to the success mock + assertion, and add tests for the new `getPermissionState` helper (injectable for mocking). Replace the success-mock + first assertion and append permission tests:
  ```ts
  function geoOk(lat: number, lng: number, accuracy = 30): Geolocation {
    return {
      getCurrentPosition: (success) =>
        success({ coords: { latitude: lat, longitude: lng, accuracy } } as GeolocationPosition),
      watchPosition: () => 0,
      clearWatch: () => {},
    }
  }
  // ...
  it('성공 시 ok + lat/lng/accuracy를 정규화해 돌려준다', async () => {
    const r = await getCurrentPosition({ geo: geoOk(37.5, 127.0, 25) })
    expect(r).toEqual({ ok: true, lat: 37.5, lng: 127.0, accuracy: 25 })
  })
  ```
  Append (import `getPermissionState`):
  ```ts
  import { getPermissionState } from '@/lib/geo/currentPosition'
  describe('getPermissionState (자동 locate 게이트)', () => {
    it('permissions 미지원이면 prompt(자동 locate 안 함)', async () => {
      expect(await getPermissionState({ permissions: null })).toBe('prompt')
    })
    it('granted면 granted', async () => {
      const permissions = { query: async () => ({ state: 'granted' }) } as unknown as Permissions
      expect(await getPermissionState({ permissions })).toBe('granted')
    })
    it('query throw(Safari 등)면 prompt 폴백', async () => {
      const permissions = { query: async () => { throw new Error('no') } } as unknown as Permissions
      expect(await getPermissionState({ permissions })).toBe('prompt')
    })
  })
  ```
- [ ] Run `npm run test -- src/__tests__/currentPosition.test.ts` (expected FAIL).
- [ ] In `currentPosition.ts`: extend success `GeoResult` with `accuracy`, accept `enableHighAccuracy` option (explicit tap), and add `getPermissionState`:
  ```ts
  export type GeoResult =
    | { ok: true; lat: number; lng: number; accuracy: number }
    | { ok: false; reason: 'unsupported' | 'denied' | 'unavailable' | 'timeout' }

  type Options = { geo?: Geolocation | null; timeoutMs?: number; highAccuracy?: boolean }
  // in getCurrentPosition success:
  (pos) => resolve({ ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
  // options:
  { enableHighAccuracy: opts.highAccuracy ?? false, timeout, maximumAge: 60_000 },
  ```
  Add the gate helper (injectable):
  ```ts
  // 자동 locate 게이트(추가 프롬프트 없이 granted일 때만, dossier 02 §4.6).
  export async function getPermissionState(opts: { permissions?: Permissions | null } = {}): Promise<PermissionState> {
    const perms = opts.permissions !== undefined ? opts.permissions
      : (typeof navigator !== 'undefined' && 'permissions' in navigator ? navigator.permissions : null)
    if (!perms) return 'prompt'
    try {
      const s = await perms.query({ name: 'geolocation' as PermissionName })
      return s.state
    } catch {
      return 'prompt' // Safari 일부 미지원 → 프롬프트 회피(자동 locate 안 함)
    }
  }
  ```
- [ ] Run `npm run test -- src/__tests__/currentPosition.test.ts` (expected PASS).
- [ ] Run `npm run typecheck` (expected FAIL — `NaverMap.tsx` auto-locate effect still uses old API and `recenter` doesn't read accuracy; fixed in Task 21. Combine commit with Task 21.)
- [ ] Defer commit; combine with Task 21.

### Task 21: self-dot marker + accuracy circle; remove auto-request; fitBounds self+places; isLocating; denial recovery

**Files:**
- Modify: `/Users/minje/Project/love_place/src/components/map/NaverMap.tsx` (refs, auto-locate gate, recenter, render)
- Modify: `/Users/minje/Project/love_place/src/components/map/NaverMap.module.css` (.selfDot, button busy state)
- Create: `/Users/minje/Project/love_place/src/__tests__/autoLocateGate.test.ts`

- [ ] Write a failing unit test for the auto-locate decision (pure gate driven by `getPermissionState`): only auto-locate when granted. Extract a tiny pure decision so it's testable without naver:
  ```ts
  import { describe, it, expect } from 'vitest'
  import { shouldAutoLocate } from '@/lib/geo/currentPosition'

  describe('shouldAutoLocate (로드 시 자동 locate 결정 — 추가 프롬프트 금지)', () => {
    it('granted면 자동 locate', () => { expect(shouldAutoLocate('granted')).toBe(true) })
    it('prompt면 자동 안 함(사용자 📍 탭에서만)', () => { expect(shouldAutoLocate('prompt')).toBe(false) })
    it('denied면 자동 안 함', () => { expect(shouldAutoLocate('denied')).toBe(false) })
  })
  ```
- [ ] Run `npm run test -- src/__tests__/autoLocateGate.test.ts` (expected FAIL).
- [ ] Add `shouldAutoLocate` to `currentPosition.ts`:
  ```ts
  /** 로드 시 자동 locate 여부 — granted일 때만(추가 프롬프트 회피, spec §3.5). 순수. */
  export function shouldAutoLocate(state: PermissionState): boolean {
    return state === 'granted'
  }
  ```
- [ ] Run `npm run test -- src/__tests__/autoLocateGate.test.ts` (expected PASS).
- [ ] In `NaverMap.tsx`:
  - Add refs `selfMarkerRef`, `accuracyCircleRef`, `userMovedRef`, and state `const [isLocating, setIsLocating] = useState(false)`.
  - Add a shared `placeAndFit` helper that renders self-dot + accuracy circle and fitBounds self+places (reuse the §1.5 bounds pattern, extend self too):
  ```ts
  const showSelf = (lat: number, lng: number, accuracy: number) => {
    const nv = window.naver, map = mapRef.current
    if (!nv || !map) return
    const pos = new nv.maps.LatLng(lat, lng)
    if (selfMarkerRef.current) selfMarkerRef.current.setPosition(pos)
    else selfMarkerRef.current = new nv.maps.Marker({
      position: pos, map, zIndex: SELECTED_ZINDEX + 2,
      icon: { content: `<div class="${styles.selfDot}" aria-label="내 위치"></div>`, anchor: new nv.maps.Point(8, 8) },
    })
    if (accuracyCircleRef.current) { accuracyCircleRef.current.setCenter(pos); accuracyCircleRef.current.setRadius(accuracy) }
    else accuracyCircleRef.current = new nv.maps.Circle({
      map, center: pos, radius: accuracy, strokeColor: '#4285F4', strokeWeight: 1, strokeOpacity: 0.4,
      fillColor: '#4285F4', fillOpacity: 0.12, clickable: false, zIndex: 0,
    })
    const pts = places.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number')
    const b = new nv.maps.LatLngBounds(pos, pos)
    for (const p of pts) b.extend(new nv.maps.LatLng(p.lat!, p.lng!))
    map.fitBounds(b)
  }
  ```
  - Replace the auto-locate-on-load effect (dossier 02 §1.4) with the gated version: after `ready`, `getPermissionState()` → `if (shouldAutoLocate(state)) getCurrentPosition()` and on success call `showSelf(...)` + `centeredRef.current = true` (only if `!userMovedRef.current`). When not granted, do nothing (Seoul/ places fallback handles it).
  - Add userMoved guard listeners on `'dragend'` only (avoid `zoom_changed` false-positives from programmatic setZoom, dossier 02 §4.4): `Event.addListener(map, 'dragend', () => { userMovedRef.current = true })`; remove in cleanup.
  - Rewrite `recenter` (📍 tap): `setIsLocating(true)` → `getCurrentPosition({ highAccuracy: true })` → on success `userMovedRef.current = false; showSelf(...)`, clear toast; on failure set the appropriate toast (`denied`→iOS-settings msg, `timeout`→retry msg, else generic) and if `!window.isSecureContext` use the insecure message; `finally setIsLocating(false)`:
  ```ts
  const recenter = () => {
    const nv = window.naver, map = mapRef.current
    if (!nv || !map || isLocating) return
    setIsLocating(true)
    void getCurrentPosition({ highAccuracy: true }).then((r) => {
      if (r.ok) { userMovedRef.current = false; showSelf(r.lat, r.lng, r.accuracy); setLocToast(null) }
      else {
        const msg = !window.isSecureContext
          ? '보안 연결(HTTPS)에서만 위치를 쓸 수 있어요.'
          : r.reason === 'denied'
            ? '위치 권한이 꺼져 있어요. 설정 > Safari > 위치에서 허용해 주세요.'
            : r.reason === 'timeout'
              ? '위치 확인이 오래 걸려요. 다시 시도해 주세요.'
              : '현재 위치를 가져오지 못했어요.'
        setLocToast(msg)
      }
    }).finally(() => setIsLocating(false))
  }
  ```
  - In render, set the 📍 button `disabled={isLocating}` + `aria-busy={isLocating}` and show a spinner glyph when locating.
  - In init cleanup, add `selfMarkerRef.current?.setMap(null)` and `accuracyCircleRef.current?.setMap(null)`.
- [ ] Add `.selfDot` to `NaverMap.module.css` (blue dot, centered):
  ```css
  /* 내 위치 점 — 파란 점(accuracy 원과 함께, spec §3.5). 색+모양으로 마커와 구분. */
  .selfDot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #4285f4;
    border: 2px solid #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.15);
    transform: translate(-50%, -50%);
  }
  ```
- [ ] Run `npm run test` (expected PASS), `npm run typecheck` (expected PASS — Task 20 + 21 together), `npm run build` (expected PASS).
- [ ] Commit (combined Task 20 + 21):
  ```
  feat(map): 내 위치 self-dot + accuracy 원 · 자동 권한요청 제거 · fitBounds · isLocating

  GeoResult에 accuracy 추가, granted일 때만 자동 locate(추가 프롬프트 금지),
  성공 시 self+places fitBounds + userMovedRef 가드, 📍 isLocating(스피너/비활성),
  거부/타임아웃/insecure 별 복구 메시지.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

## Phase P6: Search / marker / contrast

### Task 22: PlaceSearch onPick clear()+blur + clear-after-save; save-success race + jumped toast + preview auto-convert

**Files:**
- Modify: `/Users/minje/Project/love_place/src/components/places/PlaceSearch.tsx` (input ref + clear+blur on pick)
- Modify: `/Users/minje/Project/love_place/src/pages/MapPage.tsx` (jumped toast; preview→select auto-convert; save race)
- Modify: `/Users/minje/Project/love_place/src/__tests__/placeSearch.test.tsx` (clear+blur assertion)
- Modify: `/Users/minje/Project/love_place/src/__tests__/mapPagePreview.test.tsx` (jumped + auto-convert)

- [ ] Add failing test in `placeSearch.test.tsx` for clear()+blur on pick. Since `useKakaoSearch` is mocked, spy on `clear` and assert input blur:
  ```ts
  it('결과 탭 시 clear()+입력 blur로 목록/키보드를 닫는다(프리뷰 노출)', () => {
    const clear = vi.fn()
    // 이 테스트만 clear 스파이가 든 mock으로 재정의
  })
  ```
  Because the module mock is file-scoped, instead extend the existing top mock to expose a shared `clearSpy`:
  ```ts
  const clearSpy = vi.fn()
  vi.mock('@/hooks/useKakaoSearch', () => ({
    useKakaoSearch: () => ({ query: '카', setQuery: () => {}, clear: clearSpy, status: 'done', hits, error: null }),
  }))
  ```
  Then the test:
  ```ts
  it('결과 탭 시 clear()를 호출하고 입력에서 포커스를 뗀다', () => {
    render(<PlaceSearch coupleId="c1" savedKakaoIds={new Set<string>()} onPick={() => {}} />)
    const input = screen.getByLabelText('장소 검색')
    input.focus()
    fireEvent.click(screen.getByText('새 식당'))
    expect(clearSpy).toHaveBeenCalledTimes(1)
    expect(document.activeElement).not.toBe(input)
  })
  ```
- [ ] Run `npm run test -- src/__tests__/placeSearch.test.tsx` (expected FAIL).
- [ ] In `PlaceSearch.tsx`, add `const inputRef = useRef<HTMLInputElement>(null)`, set `ref={inputRef}` on the input, and change the result `onClick` to `() => { onPick(hit); clear(); inputRef.current?.blur() }`:
  ```tsx
  import { useRef } from 'react'
  // ...
  const inputRef = useRef<HTMLInputElement>(null)
  // <input ref={inputRef} ... />
  onClick={() => { onPick(hit); clear(); inputRef.current?.blur() }}
  ```
- [ ] Run `npm run test -- src/__tests__/placeSearch.test.tsx` (expected PASS).
- [ ] In `MapPage.tsx`, finalize the save-success race + jumped toast in `onSheetSave`, and add a preview→select auto-convert effect when `previewHit.kakaoPlaceId` enters `savedKakaoIds` (partner saved during preview). Update `onSheetSave`:
  ```tsx
  const onSheetSave = () => {
    if (!previewHit) return
    savePlace.mutate(previewHit, {
      onSuccess: (r) => {
        setPreviewHit(null)
        if (!r) { toast.show('오프라인이라 큐에 담았어요 — 연결되면 저장돼요'); return }
        if (r.jumped) toast.show('이미 담아둔 곳이에요 — 지도에서 보여줄게요')
        else toast.show('저장했어요')
        setSelectedId(r.placeId)
      },
      onError: (e) => toast.show(e.message, 3000),
    })
  }
  ```
  Add the auto-convert effect (preview→select when it appears in saved set):
  ```tsx
  useEffect(() => {
    if (previewHit && savedKakaoIds.has(previewHit.kakaoPlaceId)) {
      const existing = enriched.find((p) => p.kakao_place_id === previewHit.kakaoPlaceId)
      if (existing) { setPreviewHit(null); setSelectedId(existing.id) }
    }
  }, [previewHit, savedKakaoIds, enriched])
  ```
  Save-race for brand-new place: `useSavePlace.onSuccess` already invalidates `['places']`; selecting `r.placeId` before refetch lands renders the sheet detail empty for a tick. Mitigate with an optimistic cache insert in `useSavePlace` is out-of-scope for MapPage; instead the auto-convert + the realtime/invalidate refetch resolves it within a tick and PlaceDetail simply renders nothing until `selectedPlace` exists (guarded by `selectedPlace ?` in Task 11). Acceptable — no empty crash.
- [ ] In `mapPagePreview.test.tsx`, drive the sheet-save and assert `jumped` toast vs fresh-save, and the preview auto-convert. Extend the PlaceSheet stub (Task 12) and add a places mock variant where the search hit becomes saved. Add assertions:
  ```ts
  it('저장 성공(jumped) 시 "이미 담아둔 곳" 토스트', () => {
    saveMutate.mockImplementation((_hit, opts) => opts.onSuccess({ placeId: 'p9', jumped: true }))
    // pick new1 → click sheet-save → expect toast text in DOM
  })
  ```
  (Use `getByText('이미 담아둔 곳이에요 — 지도에서 보여줄게요')`.)
- [ ] Run `npm run test -- src/__tests__/mapPagePreview.test.tsx` (expected PASS).
- [ ] Run `npm run test` (expected PASS), `npm run typecheck` (expected PASS), `npm run build` (expected PASS).
- [ ] Commit:
  ```
  feat(map): 검색 onPick clear+blur · 저장 토스트(저장/이미 담김) · 프리뷰 자동 전환

  결과 탭 시 목록/키보드를 닫아 프리뷰를 노출하고, 저장 성공/ jumped를 토스트로
  피드백, previewHit가 savedKakaoIds에 들어오면 프리뷰→선택 자동 전환.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

### Task 23: savePlace dedup key adds rounded coords + 2 vitest cases

**Files:**
- Modify: `/Users/minje/Project/love_place/src/lib/places/savePlace.ts` (dedup key helper + lookup)
- Create: `/Users/minje/Project/love_place/src/__tests__/savePlaceDedup.test.ts`

- [ ] Write failing tests for a pure dedup-key helper exported from `savePlace.ts` (the coord-rounding key the lookup uses). The key is `name|address|round(lat,4)|round(lng,4)` — `KakaoPlaceHit` (src/lib/kakao/types.ts) only has `address` (no `roadAddress` field), so the helper param is `address`; do NOT reference `hit.roadAddress` (it is `undefined`). (Spec §3.2 writes "roadAddress" loosely; the concrete field across `KakaoPlaceHit` and `places.address` is `address`.):
  ```ts
  import { describe, it, expect } from 'vitest'
  import { dedupKey } from '@/lib/places/savePlace'

  describe('savePlace dedup 키(좌표 포함) — 같은 건물 다른 가게 구분 + 지번/도로명 변형 흡수', () => {
    it('이름·주소·반올림 좌표(4자리)로 키를 만든다', () => {
      expect(dedupKey({ name: '칠성조선소', address: '강원 속초시 중앙로 6', lat: 38.20741, lng: 128.59123 }))
        .toBe('칠성조선소|강원 속초시 중앙로 6|38.2074|128.5912')
    })
    it('좌표가 4자리 이하 미세 차이면 같은 키(변형 흡수), 다른 가게면 이름이 달라 다른 키', () => {
      const a = dedupKey({ name: '카페A', address: '같은건물 1층', lat: 37.500001, lng: 127.000004 })
      const b = dedupKey({ name: '카페A', address: '같은건물 1층', lat: 37.500009, lng: 127.000001 })
      const c = dedupKey({ name: '카페B', address: '같은건물 2층', lat: 37.500001, lng: 127.000004 })
      expect(a).toBe(b)
      expect(a).not.toBe(c)
    })
  })
  ```
- [ ] Run `npm run test -- src/__tests__/savePlaceDedup.test.ts` (expected FAIL).
- [ ] In `savePlace.ts`, add and export `dedupKey` and use a rounded-coords fallback lookup when the kakao_place_id match misses (catch the same physical place under a different synthetic id):
  ```ts
  /** dedup 키(순수): 이름|주소|round(lat,4)|round(lng,4). 같은 건물 다른 가게 구분 + 좌표 미세변형 흡수. */
  export function dedupKey(o: { name: string; address: string; lat: number; lng: number }): string {
    const r = (n: number) => (Math.round(n * 1e4) / 1e4).toFixed(4)
    return `${o.name}|${o.address}|${r(o.lat)}|${r(o.lng)}`
  }
  ```
  In `savePlace`, after the `kakao_place_id` lookup misses, add a coord-window fallback: query candidate rows in the same couple within a small lat/lng window and match by `dedupKey`:
  ```ts
  if (!existing) {
    const eps = 0.0001
    const { data: near } = await supabase
      .from('places')
      .select('id, name, address, lat, lng')
      .eq('couple_id', coupleId)
      .is('deleted_at', null)
      .gte('lat', hit.lat - eps).lte('lat', hit.lat + eps)
      .gte('lng', hit.lng - eps).lte('lng', hit.lng + eps)
    const key = dedupKey({ name: hit.name, address: hit.address, lat: hit.lat, lng: hit.lng })
    const match = (near ?? []).find(
      (p) => p.lat != null && p.lng != null && dedupKey({ name: p.name as string, address: (p.address as string) ?? '', lat: p.lat as number, lng: p.lng as number }) === key,
    )
    if (match) { placeId = match.id as string; jumped = true }
  }
  ```
  Restructure the existing `if (existing) {...} else {...}` so the insert only runs when neither the kakao_place_id nor the coord-key matched (introduce a `matched` boolean to avoid a deep nest).
- [ ] Run `npm run test -- src/__tests__/savePlaceDedup.test.ts` (expected PASS).
- [ ] Run `npm run test` (expected PASS), `npm run typecheck` (expected PASS), `npm run build` (expected PASS).
- [ ] Commit:
  ```
  feat(map): savePlace dedup 키에 반올림 좌표 추가(같은 건물 다른 가게 구분)

  name|address|round(lat,4)|round(lng,4) 키로 kakao_place_id 변형을 흡수하는
  좌표창 폴백 조회를 추가하고 순수 dedupKey를 2종 테스트로 못박는다(spec §3.2).

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

### Task 24: marker visited check-glyph + dark-mode success/danger tokens + remove false .actionDone disabled

**Files:**
- Modify: `/Users/minje/Project/love_place/src/lib/places/markerVisual.ts` (add `badge`)
- Modify: `/Users/minje/Project/love_place/src/lib/places/selectedMarker.ts` (render badge in markerIconHtml)
- Modify: `/Users/minje/Project/love_place/src/__tests__/markerVisual.test.ts` (badge assertion)
- Modify: `/Users/minje/Project/love_place/src/__tests__/selectedMarker.test.ts` (badge render assertion)
- Modify: `/Users/minje/Project/love_place/src/components/map/NaverMap.module.css` (.pinCheck)
- Modify: `/Users/minje/Project/love_place/src/styles/tokens.css` (dark --c-success / --c-danger)

- [ ] Update `markerVisual.test.ts`: keep glyph assertions (★/♥/☆ unchanged) and ADD that visited carries a `badge: '✓'` while others have none (preserves existing tests, dossier 02 §3.3 recommended approach):
  ```ts
  it('가봤음 마커엔 체크 배지(✓)가 붙는다(색만이 아닌 실루엣 구분)', () => {
    expect(markerVisual({ visited: true, bothWished: false, name: '카페' }).badge).toBe('✓')
    expect(markerVisual({ visited: false, bothWished: true, name: '카페' }).badge).toBeUndefined()
    expect(markerVisual({ visited: false, bothWished: false, name: '카페' }).badge).toBeUndefined()
  })
  ```
- [ ] Run `npm run test -- src/__tests__/markerVisual.test.ts` (expected FAIL).
- [ ] In `markerVisual.ts`, add `badge?: string` to `MarkerVisual` and set it on visited:
  ```ts
  export type MarkerVisual = { glyph: string; kind: MarkerKind; label: string; badge?: string }
  // visited branch:
  if (visited) return { glyph: '★', kind: 'visited', label: `${name} — 가봤음`, badge: '✓' }
  ```
- [ ] In `selectedMarker.ts`, accept an optional `badge` and render it as a small overlay span:
  ```ts
  export function markerIconHtml(opts: { glyph: string; pinClass: string; label: string; selected: boolean; badge?: string }): string {
    const cls = `${opts.pinClass}${opts.selected ? ` ${pin.pinSelected}` : ''}`.trim()
    const badge = opts.badge ? `<span class="${pin.pinCheck}" aria-hidden>${escapeHtml(opts.badge)}</span>` : ''
    return `<div class="${cls}" aria-label="${escapeHtml(opts.label)}">${opts.glyph}${badge}</div>`
  }
  ```
- [ ] Update the two `markerIconHtml` call sites in `NaverMap.tsx` (cluster-render single marker + selection-highlight effect) to pass `badge: visual.badge`.
- [ ] Update `selectedMarker.test.ts` to assert badge renders when provided (append):
  ```ts
  it('badge가 주어지면 체크 배지 스팬이 렌더된다', () => {
    const html = markerIconHtml({ glyph: '★', pinClass: 'pin pinVisited', label: '카페 — 가봤음', selected: false, badge: '✓' })
    expect(html).toContain('✓')
  })
  ```
- [ ] Add `.pinCheck` to `NaverMap.module.css`:
  ```css
  /* 가봤음 체크 배지 — ★ 위 작은 ✓(색이 아닌 실루엣으로 구분, §8). */
  .pinCheck {
    position: absolute;
    margin-left: -6px;
    margin-top: -10px;
    font-size: 11px;
    color: #fff;
    background: var(--c-success);
    border-radius: 50%;
    width: 14px;
    height: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  ```
- [ ] In `tokens.css` dark block, add AA-contrast overrides for `--c-success` and `--c-danger` (lighter on dark surfaces, ≥4.5:1 on `--c-surface #241e1b`):
  ```css
  @media (prefers-color-scheme: dark) {
    :root {
      /* ...existing dark overrides... */
      --c-success: #6fb98a;
      --c-danger: #e87a6d;
    }
  }
  ```
- [ ] Confirm `.actionDone` false-disabled was already removed in PlaceDetail's CSS (Task 9) and there is no remaining `.actionDone { opacity ...; cursor: default }` anywhere: `grep -rn "actionDone" src` → expect only the PlaceDetail color+weight rule (InfoWindow.module.css deleted in Task 13).
- [ ] Run `npm run test` (expected PASS), `npm run typecheck` (expected PASS), `npm run build` (expected PASS).
- [ ] Commit:
  ```
  feat(map): 가봤음 마커 체크 글리프(✓) + 다크 success/danger 대비 토큰

  markerVisual에 badge('✓')를 추가해 ★를 색이 아닌 실루엣으로 구분하고,
  다크모드 --c-success/--c-danger를 AA 대비로 오버라이드. 허위 disabled 잔재 제거.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

## Phase P7: Final gate + snapshot regression

### Task 25: Full gates + harness snapshot regression + manual Naver-logo seam checklist

**Files:**
- Modify: `/Users/minje/Project/love_place/e2e/map-harness.spec.ts` (add peek+half + preview + light/dark + small/large coverage now that P1-P6 landed)

- [ ] Extend `map-harness.spec.ts` to capture the remaining baseline states that depend on completed phases: search-preview (drive the search overlay → preview detail in sheet), peek+half (assert handle `aria-expanded` toggles), light+dark (both color schemes), small + large viewport. Add a preview test using a routed `naver-search`/`functions/v1` response and `MapSearchOverlay`:
  ```ts
  test('검색 프리뷰 — 결과 탭 시 시트에 프리뷰 상세', async ({ page }) => {
    await seedAuthedMap(page, { places: PLACES })
    await page.route('**/e2e.supabase.co/functions/v1/naver-search**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, hits: [
        { kakaoPlaceId: 'kx', name: '새 후보 식당', address: '서울 중구', lat: 37.56, lng: 126.98, category: '식당', placeUrl: '' },
      ] }) }))
    await page.goto('/')
    await page.getByLabel('장소 검색').fill('식당')
    await page.getByText('새 후보 식당').click()
    await expect(page.getByLabelText('검색 결과 미리보기')).toBeVisible()
    const s = shot('map-preview')
    test.skip(s.skip, `베이스라인 없음(${process.platform})`)
    await expect(page).toHaveScreenshot(s.file, { fullPage: true })
  })

  test.describe('작은/큰 뷰포트', () => {
    test.use({ viewport: { width: 360, height: 740 } })
    test('작은 화면 — 빈 상태', async ({ page }) => {
      await seedAuthedMap(page, {})
      await page.goto('/')
      await expect(page.getByRole('region', { name: '장소 시트' })).toBeVisible()
      const s = shot('map-small')
      test.skip(s.skip, `베이스라인 없음(${process.platform})`)
      await expect(page).toHaveScreenshot(s.file, { fullPage: true })
    })
  })
  ```
- [ ] Seed new baselines on darwin: `npm run build:e2e && SEED_SNAPSHOT=1 npm run e2e`; then re-run `npm run e2e` (expected PASS).
- [ ] Run the FULL gate suite in order and confirm each passes:
  - `npm run typecheck` (expected PASS, 0 errors)
  - `npm run test` (expected PASS, all vitest including new dedup/currentPosition/sheetSnap/placeDetail/placePreviewDetail/toggleReaction/appViewport/autoLocateGate)
  - `npm run build` (expected PASS)
  - `npm run build:e2e && npm run e2e` (expected PASS, including `smoke.spec.ts` + harness)
- [ ] Manual checklist (record in the commit body, not a separate file): on a real mobile Safari + Chrome, verify the Naver logo/scale sits in the visible map band just above the peek sheet (not under the tab bar or sheet), at peek/half/full, light+dark, and after rotation. This is the one item the stubbed harness cannot reproduce (spec §5).
- [ ] Commit:
  ```
  test(e2e): 프리뷰/작은화면 하베스 스냅샷 + 최종 게이트 회귀

  검색 프리뷰·작은 뷰포트 베이스라인을 추가하고 typecheck/test/build/e2e 전 게이트
  통과를 확인. 네이버 로고 seam은 스텁 미재현 → 실기기 수동 점검(spec §5).

  수동 점검: peek/half/full · 라/다 · 회전에서 로고가 peek 위 가시 밴드에 있음.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

## Cross-cutting notes

- **Combined commits (cannot independently typecheck):** Task 5 + Task 6 (sheetSnap signature change breaks PlaceSheet until rewired); Task 20 + Task 21 (GeoResult shape change breaks NaverMap until recenter/auto-locate rewired). All other tasks are independently committable and typecheck-clean.
- **Deleted files:** `infoWindowHtml.test.ts`, `previewWindowHtml.test.ts`, `InfoWindow.module.css`. KEPT (still used): `infoWindowHtml.ts` (only `escapeHtml`), `directionsUrl.ts` + `directionsUrl.test.ts` (call sites removed from MapPage, lib retained for possible future use).
- **Consistent names across tasks:** `--app-vh`, `sheetTravelHeight`, `setAppVh`, `peekPx`, `translateYFor(stop, travelHeight, peekPx)`, lifted `snap`/`onSnapChange` (MapPage owns `snap`, threads to NaverMap + MapSearchOverlay + PlaceSheet), `data-hidden` collapse flag (`.myLocBtn`/`.locToast`/`.overlay`), `PlaceDetail`/`PlacePreviewDetail`, `onSheetSave`, `onCloseDetail`, `showSelf`, `userMovedRef`, `isLocating`, `getPermissionState`/`shouldAutoLocate`, `dedupKey` (param `address`, not `roadAddress`), `MarkVisited` mutation vars `{ placeId; visitDate?; alreadyVisited? }`, `markerVisual.badge`, `.pinCheck`, `.selfDot`, `.backdrop`, `.emptyAction`, `.retryBtn`.
- **DRY:** one viewport source (`--app-vh` + `sheetTravelHeight`) feeds sheet translate, map inset, floating buttons; one `softDelete` helper for un-visit + un-react; one `dedupKey` shared by online save and (implicitly) the offline `place.save` replay.
- **YAGNI:** no new sheet-snap stops, no landscape side-sheet, no marker keyboard focus (deferred per spec §8).
