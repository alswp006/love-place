# Map UX Overhaul Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the unified map screen feel like a real map app — full-bleed layout, my-location centering, Naver-style search preview/save, a 가봤어요 toggle, marker clustering — while shedding clutter (source avatars on places, trips/trash sections, page title/TodayCard) and moving the trash recovery UI to the 우리 tab.

**Architecture:** All map orchestration stays in `MapPage`, which calls every data hook once (single Realtime subscription) and shares `selectedId` + new `previewHit` state between `NaverMap` and `PlaceSheet`. Pure helpers (`currentPosition`, `clusterPlaces`, `previewWindowHtml`) live under `src/lib/` and are unit-tested in isolation; `NaverMap` consumes them imperatively. RLS/optimistic-lock/soft-delete contracts are preserved (the new `useUnmarkVisited` soft-deletes visit rows with a version-conditional lock).

**Tech Stack:** React 18 + Vite + TS strict, Supabase (Postgres/RLS/Realtime), TanStack Query, React Router, Naver Maps JS SDK v3, vitest, Playwright.

---

## Conventions used across every task

- **Commands:** typecheck = `npm run typecheck`; one test file = `npm run test -- src/__tests__/<file>`; full test run = `npm run test`; build = `npm run build`; e2e = `npm run e2e`.
- **Shared names introduced by this plan (reuse verbatim, do not invent variants):**
  - CSS var `--sheet-peek-h` (peek band height) and `--tabbar-h` (de-facto 72px tab-bar constant), both added to `src/styles/tokens.css`.
  - `ScreenScaffold` prop `fullBleed?: boolean`.
  - Visit-toggle hook `useUnmarkVisited(coupleId, myId, onConflict)`; PlaceList prop `onUnvisit: (placeId: string) => void` + `unvisitPending: boolean`.
  - Geolocation wrapper `getCurrentPosition(opts?)` in `src/lib/geo/currentPosition.ts` returning `GeoResult`.
  - Cluster helper `clusterPlaces(points, zoom)` in `src/lib/places/clusterPlaces.ts` returning `ClusterOrSingle[]`.
  - Preview bubble builder `previewWindowHtml(hit)` in `src/lib/places/infoWindowHtml.ts`.
  - MapPage state: `previewHit: KakaoPlaceHit | null`; PlaceSearch/MapSearchOverlay props `savedKakaoIds: Set<string>` + `onPick: (hit: KakaoPlaceHit) => void`.
- **Commit messages:** Korean conventional commits. End EVERY body with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Deviations to record in code comments** (per spec §7): (a) place source-avatar removal (ux §2), (b) my-location centering replaces auto-fitBounds (설계서 §5.5), (c) pure grid clusterer instead of the "네이버 MarkerClustering 샘플" (web-stack §5), (d) authenticated map Playwright smoke deferred — unreachable in key-less e2e; verified by vitest MapPage mount + manual spot-check (recorded in spec §6/§7).

---

## Phase P1: 풀블리드 / 레이아웃

### Task 1: Add shared layout tokens (`--sheet-peek-h`, `--tabbar-h`)

**Files:**
- Modify: `src/styles/tokens.css` (safe-area block, around lines 314-316)
- Test: `src/__tests__/manifest.test.ts` (existing token presence test pattern — extend only if it already asserts tokens; otherwise no test here, this is a token-only change consumed by later tasks)

- [ ] Add the two layout constants right after the safe-area vars in `src/styles/tokens.css`. Find:
  ```css
  /* safe-area(노치/홈 인디케이터, §8) */
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  ```
  Replace with:
  ```css
  /* safe-area(노치/홈 인디케이터, §8) */
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);

  /* 레이아웃 상수 — 중복 매직넘버 단일화(research 01 §9·§10).
     --tabbar-h: 하단 탭바 실효 높이(앱 전역에서 72px로 박혀 있던 값).
     --sheet-peek-h: 드래그 시트 peek 밴드 높이 = sheetSnap의 peek ratio 0.18을 CSS로 미러링한
       단일 소스(18dvh ≈ 0.18*viewportHeight). 지도 하단 인셋과 시트 peek 밴드가 이 한 값을 공유해
       JS(translateYFor: innerHeight*0.18)와 CSS가 같은 높이를 가리키게 한다(research 01 §10).
       peek 밴드는 viewport 진짜 하단(bottom:0)에서 측정되며 시트가 하단 safe-area를 자체 흡수하므로,
       지도 인셋에 --safe-bottom을 추가로 더하지 않는다(이중 가산 금지). */
  --tabbar-h: 72px;
  --sheet-peek-h: 18dvh;
  ```
- [ ] `npm run build` → expected PASS (Vite parses CSS; tokens compile).
- [ ] `npm run typecheck` → expected PASS (no TS touched).
- [ ] Commit:
  ```
  git add src/styles/tokens.css
  git commit -m "$(cat <<'EOF'
  feat(styles): 시트 peek·탭바 높이 공유 토큰(--sheet-peek-h/--tabbar-h)

  research 01 §9·§10 — 앱 전역에 흩어진 72px 탭바 매직넘버와 시트 peek 0.18을
  토큰으로 단일화. --sheet-peek-h(18dvh)는 sheetSnap peek ratio 0.18을 미러링한 단일
  소스로, 지도 하단 인셋과 시트 peek 밴드가 공유(후속 풀블리드 인셋이 참조).

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

### Task 2: ScreenScaffold `fullBleed` variant

**Files:**
- Modify: `src/components/common/ScreenScaffold.tsx` (full file, lines 14-37)
- Modify: `src/components/common/ScreenScaffold.module.css` (append a `.fullBleed` rule)
- Test: `src/__tests__/screenScaffold.test.tsx` (Create)

- [ ] Write a failing test `src/__tests__/screenScaffold.test.tsx`:
  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { ScreenScaffold } from '@/components/common/ScreenScaffold'

  describe('ScreenScaffold', () => {
    it('기본(non-fullBleed)은 헤더(h1)와 testId를 렌더한다', () => {
      render(<ScreenScaffold title="지도" subtitle="부제" testId="page-map">본문</ScreenScaffold>)
      expect(screen.getByTestId('page-map')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '지도' })).toBeInTheDocument()
      expect(screen.getByText('본문')).toBeInTheDocument()
    })

    it('fullBleed면 시각적 헤더(타이틀/부제)를 생략하되 testId와 접근성 이름은 유지한다', () => {
      render(
        <ScreenScaffold title="지도" subtitle="부제" testId="page-map" fullBleed>
          본문
        </ScreenScaffold>,
      )
      // testId 유지(라우팅 테스트 page-map 보존).
      expect(screen.getByTestId('page-map')).toBeInTheDocument()
      // 시각적 라지 타이틀/부제는 렌더하지 않는다(풀블리드).
      expect(screen.queryByText('부제')).not.toBeInTheDocument()
      // 그러나 section은 접근성 이름(landmark)을 유지한다.
      expect(screen.getByRole('region', { name: '지도' })).toBeInTheDocument()
      expect(screen.getByText('본문')).toBeInTheDocument()
    })
  })
  ```
- [ ] Run `npm run test -- src/__tests__/screenScaffold.test.tsx` → expected FAIL (`fullBleed` prop not yet supported; the visual title still renders).
- [ ] Rewrite `src/components/common/ScreenScaffold.tsx` to:
  ```tsx
  import type { ReactNode } from 'react'
  import styles from './ScreenScaffold.module.css'

  // 모든 탭 화면의 공통 골격: 라지 타이틀 + 콘텐츠. 시맨틱 HTML(접근성 §8).
  // fullBleed=true: 지도 화면용 — 시각적 헤더(타이틀/부제)와 본문 패딩을 생략하되
  // data-testid는 유지(라우팅 테스트 page-map 보존)하고 section에 aria-label로 접근성 이름을 남긴다.
  type Props = {
    title: string
    subtitle?: string
    children?: ReactNode
    testId?: string
    fullBleed?: boolean
  }

  export function ScreenScaffold({ title, subtitle, children, testId, fullBleed = false }: Props) {
    if (fullBleed) {
      return (
        <section className={styles.fullBleed} data-testid={testId} aria-label={title}>
          {children}
        </section>
      )
    }
    return (
      <section className={styles.screen} data-testid={testId}>
        <header className={styles.header}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </header>
        <div className={styles.body}>{children}</div>
      </section>
    )
  }
  ```
- [ ] Append the full-bleed style to `src/components/common/ScreenScaffold.module.css`. Do NOT use percentage height (`.content` is an `overflow-y:auto` flex item, so `height:100%` would not resolve reliably across browsers — research 01 §8). Chain from the parent flex instead: `.content` becomes a flex column (Task 3) and `.fullBleed` takes `flex:1; min-height:0`.
  ```css
  /* 풀블리드(지도) — 헤더/패딩 없이 셸 콘텐츠 영역(.content, flex column)을 flex로 가득 채운다.
     percentage height에 의존하지 않는다(.content가 overflow-y:auto 플렉스 아이템이라 height:100%
     해상도가 불안정 — research 01 §8). flex:1 + min-height:0으로 자식(mapWrap)이 다시 flex 가능. */
  .fullBleed {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  ```
- [ ] Run `npm run test -- src/__tests__/screenScaffold.test.tsx` → expected PASS.
- [ ] `npm run typecheck` → expected PASS.
- [ ] Commit:
  ```
  git add src/components/common/ScreenScaffold.tsx src/components/common/ScreenScaffold.module.css src/__tests__/screenScaffold.test.tsx
  git commit -m "$(cat <<'EOF'
  feat(layout): ScreenScaffold fullBleed variant(헤더/패딩 생략, testId·aria-label 유지)

  지도 화면 풀블리드용. 기존 호출부는 디폴트 false라 영향 없음. 풀블리드도 section
  접근성 이름(aria-label=title)을 유지해 landmark 보존(ux §4).

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

### Task 3: MapPage full-bleed + remove TodayCard + map bottom inset

**Files:**
- Modify: `src/pages/MapPage.tsx` (line 5 TodayCard import, lines 62-63 scaffold open + TodayCard child)
- Modify: `src/pages/MapPage.module.css` (`.mapWrap` rule)
- Modify: `src/app/AppLayout.module.css` (`.content` — make it a definite-height flex column so the full-bleed child resolves)
- Test: `src/__tests__/routing.test.tsx` (update `/` assertions from `<h1>` to `region` — see below)

NOTE on the routing test: it asserts `getByRole('heading', { name: '지도' })` for the `/` row. With MapPage going full-bleed (no `<h1>`), that heading must still come from somewhere. It does NOT — the heading currently comes from MapPage's scaffold `<h1>`. So this task MUST keep the routing test green by adding a visually-hidden `<h1>` is NOT desired (spec wants no title). Instead, keep the accessible name as the section `aria-label` (Task 2) and **update the routing assertion** to match a region landmark for `/`. Do this surgically below.

- [ ] Update `src/__tests__/routing.test.tsx` so the map row no longer requires an `<h1>` (it now has a full-bleed region). Find the first test:
  ```tsx
  it('루트(/)는 지도 화면을 첫 화면으로 렌더한다', async () => {
    renderAt('/')
    expect(await screen.findByTestId('page-map')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '지도' })).toBeInTheDocument()
  })
  ```
  Replace with:
  ```tsx
  it('루트(/)는 지도 화면을 첫 화면으로 렌더한다(풀블리드 — 라지 타이틀 없이 region 이름 유지)', async () => {
    renderAt('/')
    expect(await screen.findByTestId('page-map')).toBeInTheDocument()
    // 풀블리드 지도엔 라지 타이틀(h1)이 없고 section aria-label='지도'로 접근성 이름 유지.
    expect(screen.getByRole('region', { name: '지도' })).toBeInTheDocument()
  })
  ```
  And in the `it.each(TABS...)` block, the map row would also assert a heading. Change the each body to tolerate the map's region:
  ```tsx
  it.each(TABS.map((t) => [t.path, t.testId, t.title] as const))(
    '%s 경로는 %s 화면을 렌더한다',
    async (path, testId, heading) => {
      renderAt(path)
      expect(await screen.findByTestId(testId)).toBeInTheDocument()
      if (path === '/') {
        // 지도는 풀블리드 — h1 대신 region 이름으로 접근성 이름 확인.
        expect(screen.getByRole('region', { name: heading })).toBeInTheDocument()
      } else {
        expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
      }
    },
  )
  ```
- [ ] Run `npm run test -- src/__tests__/routing.test.tsx` → expected FAIL (MapPage still renders an `<h1>` heading "지도" AND the new `region` assertion now also expects a region; the `/` `region` query fails because the scaffold is not yet full-bleed).
- [ ] Make `.content` a definite-height flex column in `src/app/AppLayout.module.css` so the full-bleed child resolves its size from the parent flex (not from a fragile percentage). `.shell` already has `height:100%; min-height:100dvh` (definite). Find:
  ```css
  .content {
    flex: 1;
    overflow-y: auto;
    padding-top: var(--safe-top);
    -webkit-overflow-scrolling: touch;
  }
  ```
  Replace with:
  ```css
  /* 셸 콘텐츠 영역 — flex 컬럼으로 만들어 풀블리드(지도) 자식이 flex:1로 높이를 얻게 한다.
     min-height:0은 플렉스 아이템의 콘텐츠 오버플로 클램프(자식 스크롤/지도 높이 해상도). research 01 §8. */
  .content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    padding-top: var(--safe-top);
    -webkit-overflow-scrolling: touch;
  }
  ```
- [ ] Edit `src/pages/MapPage.tsx`. Remove the TodayCard import (line 5):
  ```tsx
  import { TodayCard } from '@/components/common/TodayCard'
  ```
  (delete that line entirely).
- [ ] In `src/pages/MapPage.tsx`, change the scaffold opening + remove the `<TodayCard ... />` child. Find:
  ```tsx
      <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
        <TodayCard coupleId={coupleId} />
        {isNaverMapConfigured() ? (
  ```
  Replace with:
  ```tsx
      <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId} fullBleed>
        {isNaverMapConfigured() ? (
  ```
- [ ] Rewrite the `.mapWrap` rule in `src/pages/MapPage.module.css` so the map fills the full-bleed area and is inset at the bottom by ONLY the peek band (the peek sheet sits at viewport `bottom:0` and absorbs the bottom safe-area itself, so do NOT add `--safe-bottom` here — that would double-count, research 01 §10). Replace:
  ```css
  .mapWrap {
    position: relative;
    height: calc(100dvh - 220px);
    min-height: 60vh;
    display: flex;
  }
  ```
  with:
  ```css
  /* 풀블리드 지도 — .fullBleed(flex 컬럼)를 flex로 가득 채우고, 하단은 시트 peek 밴드(--sheet-peek-h)
     만큼만 인셋해서 네이버 로고/축척이 peek 시트 바로 위에 보이게 한다(research 01 §10). peek 밴드는
     viewport 하단(bottom:0)에서 측정되며 시트가 하단 safe-area를 자체 흡수하므로 --safe-bottom을
     추가하지 않는다(이중 가산 금지). 시트가 half/full로 펼쳐지면 의도적으로 지도를 덮는 오버레이가 된다. */
  .mapWrap {
    position: relative;
    flex: 1;
    display: flex;
    min-height: 0;
    padding-bottom: var(--sheet-peek-h);
  }
  ```
- [ ] Run `npm run test -- src/__tests__/routing.test.tsx` → expected PASS (map is full-bleed region; other tabs keep headings).
- [ ] Run `npm run test -- src/__tests__/screenScaffold.test.tsx` → expected PASS (regression check).
- [ ] `npm run typecheck` → expected PASS.
- [ ] `npm run build` → expected PASS (Vite parses the CSS changes).
- [ ] **Manual/measured verification (no commit):** open the app in a browser (`npm run dev`) at a mobile viewport WITH an iOS-style safe-area inset (e.g. Chrome DevTools device toolbar → iPhone with notch, or use the simulator). Confirm: (1) the map fills the viewport minus the bottom tab bar (NOT 0/short height — guards research 01 §8 percentage-height collapse); (2) the Naver logo + scale control render visibly in the gap BETWEEN the map's bottom edge and the peek sheet's top edge (not clipped under the sheet, not floating in a gap above the real peek — guards research 01 §10 the exact bug §3.1 fixes). Record the result in the PR description.
- [ ] Commit:
  ```
  git add src/pages/MapPage.tsx src/pages/MapPage.module.css src/app/AppLayout.module.css src/__tests__/routing.test.tsx
  git commit -m "$(cat <<'EOF'
  feat(map): 지도 화면 풀블리드 + TodayCard/타이틀 제거 + 하단 peek 인셋

  ScreenScaffold fullBleed로 라지 타이틀/부제 제거, TodayCard 삭제. .content를 flex 컬럼으로
  만들어 풀블리드 자식이 flex로 높이를 얻게 함(percentage-height 붕괴 회피, research 01 §8).
  mapWrap을 하단 --sheet-peek-h만큼만 인셋(시트가 safe-area 자체 흡수 → 이중가산 제거)해
  네이버 로고/축척이 peek 시트 위에 보이게 함(research 01 §10). 라우팅 테스트는 region 이름으로 검증.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

### Task 4: NaverMap controls (scaleControl) + safe-area on the map fallback

**Files:**
- Modify: `src/components/map/NaverMap.tsx` (init effect map options, lines ~99-104)
- Test: covered by build/typecheck (map option is runtime; no unit harness for SDK). Keep existing `markerVisual`/`selectedMarker` tests green.

- [ ] In `src/components/map/NaverMap.tsx`, find the `new nv.maps.Map(...)` options:
  ```tsx
        mapRef.current = new nv.maps.Map(elRef.current, {
          center: new nv.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
          zoom: 11,
          logoControl: true,
          mapDataControl: false,
        })
  ```
  Replace with:
  ```tsx
        mapRef.current = new nv.maps.Map(elRef.current, {
          center: new nv.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
          zoom: 11,
          // 로고는 ToS상 유지(필수), 축척 표시 명시(spec §3.1). 데이터 컨트롤은 숨김.
          logoControl: true,
          scaleControl: true,
          mapDataControl: false,
        })
  ```
- [ ] `npm run typecheck` → expected PASS (`scaleControl` is in `MapOptions`, research 02 §2.5).
- [ ] `npm run test -- src/__tests__/markerVisual.test.ts` → expected PASS (regression).
- [ ] Commit:
  ```
  git add src/components/map/NaverMap.tsx
  git commit -m "$(cat <<'EOF'
  feat(map): 네이버 지도 축척 컨트롤 표시(scaleControl) — 로고는 ToS상 유지

  spec §3.1. 풀블리드 하단 인셋으로 로고/축척이 peek 시트 위에 보이게 됨.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Phase P2: 출처 아바타 제거

### Task 5: Remove SourceAvatar from PlaceList (drop unused `profiles`/`myId`)

**Files:**
- Modify: `src/components/places/PlaceList.tsx` (line 367 import, lines 379-414 props, line 491 usage)
- Modify: `src/__tests__/placeList.test.tsx` (baseProps lines 17-34)

- [ ] Update `src/__tests__/placeList.test.tsx` baseProps to drop `profiles`/`myId` (they become non-props after removal — excess props are a TS error under strict). Find:
  ```tsx
  const baseProps = {
    visible: [place] as WithWish<PlaceRow>[],
    wishes: { byPlace: {}, mine: {} },
    visitedIds: new Set<string>(),
    profiles: {},
    myId: 'u1',
    placesLoading: false,
  ```
  Replace with:
  ```tsx
  const baseProps = {
    visible: [place] as WithWish<PlaceRow>[],
    wishes: { byPlace: {}, mine: {} },
    visitedIds: new Set<string>(),
    placesLoading: false,
  ```
- [ ] Run `npm run test -- src/__tests__/placeList.test.tsx` → expected FAIL/typecheck error is fine; at minimum the test file no longer compiles cleanly against the OLD PlaceList (which still requires `profiles`/`myId`). (Run still executes existing assertions but TS will flag missing required props once we proceed; treat the red as the failing step.)
- [ ] Edit `src/components/places/PlaceList.tsx`. Remove the SourceAvatar import (line 367):
  ```tsx
  import { SourceAvatar } from '@/components/common/SourceAvatar'
  ```
  (delete the line). Also remove the now-unused `ProfileMap` import (line 369):
  ```tsx
  import type { ProfileMap } from '@/hooks/useProfiles'
  ```
  (delete the line).
- [ ] In the PlaceList props destructure + type, remove `profiles` and `myId`. Find:
  ```tsx
  export function PlaceList({
    visible,
    wishes,
    visitedIds,
    profiles,
    myId,
    placesLoading,
  ```
  Replace with:
  ```tsx
  export function PlaceList({
    visible,
    wishes,
    visitedIds,
    placesLoading,
  ```
  And in the type block find:
  ```tsx
    visible: WithWish<PlaceRow>[]
    wishes: WishData | undefined
    visitedIds: Set<string>
    profiles: ProfileMap
    myId: string | null
    placesLoading: boolean
  ```
  Replace with:
  ```tsx
    visible: WithWish<PlaceRow>[]
    wishes: WishData | undefined
    visitedIds: Set<string>
    placesLoading: boolean
  ```
- [ ] Remove the SourceAvatar usage in the card side (line 491). Find:
  ```tsx
                    <SourceAvatar userId={p.added_by} profiles={profiles} myId={myId} context=" 추가" />
  ```
  Replace with:
  ```tsx
                    {/* 편차: 장소 카드 출처 아바타 제거(ux §2 "모든 공유 항목 출처" 예외 — 사용자 결정, spec §3.2). */}
  ```
- [ ] Run `npm run test -- src/__tests__/placeList.test.tsx` → expected PASS (existing assertions: name, badge, onSelect, skeleton, empty — none reference the avatar).
- [ ] `npm run typecheck` → expected PASS (no unused `profiles`/`myId`/`ProfileMap`; PlaceList no longer reads `added_by` for the avatar — `p.added_by` remains on the row type, just unused, which is fine).
- [ ] Commit:
  ```
  git add src/components/places/PlaceList.tsx src/__tests__/placeList.test.tsx
  git commit -m "$(cat <<'EOF'
  refactor(places): 장소 카드 출처 아바타 제거(미사용 profiles/myId prop 정리)

  편차: ux §2 "모든 공유 항목 출처 표시"에서 장소만 예외(spec §3.2 사용자 결정).
  SourceAvatar 컴포넌트는 CalendarPage가 계속 사용하므로 유지.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

### Task 6: Remove avatarHtml from infoWindowHtml (drop unused `profiles`/`myId` params)

**Files:**
- Modify: `src/lib/places/infoWindowHtml.ts` (lines 342-372 imports/avatarHtml, lines 374-419 signature/body)
- Modify: `src/components/map/NaverMap.tsx` (InfoWindow effect call, lines ~248-257)
- Modify: `src/__tests__/infoWindowHtml.test.ts` (all `infoWindowHtml(place, {}, 'u1', state)` calls)

- [ ] Update `src/__tests__/infoWindowHtml.test.ts`: change every `infoWindowHtml(place, {}, 'u1', { ... })` to the new 2-arg signature `infoWindowHtml(place, { ... })`. There are 10 call sites. Replace ALL occurrences (`infoWindowHtml(place, {}, 'u1', ` → `infoWindowHtml(place, `); do not rely on the exact count. (The `escapeHtml` test is unaffected.)
- [ ] Run `npm run test -- src/__tests__/infoWindowHtml.test.ts` → expected FAIL (the current `infoWindowHtml` requires 4 args; the 2-arg calls fail typecheck/run).
- [ ] Edit `src/lib/places/infoWindowHtml.ts`. Remove the avatar imports + helper. Find and delete:
  ```ts
  import type { ProfileMap } from '@/hooks/useProfiles'
  ```
  and
  ```ts
  import avStyles from '@/components/common/SourceAvatar.module.css'
  ```
  and the entire `avatarHtml` function:
  ```ts
  // SourceAvatar와 동일한 색/이니셜 도출을 HTML 문자열로 재현(React 컴포넌트는 문자열에 못 씀).
  export function avatarHtml(userId: string, profiles: ProfileMap, myId: string | null): string {
    const p = profiles[userId]
    const isMe = userId === myId
    const name = p?.displayName.trim() || (isMe ? '나' : '상대')
    const color = p?.color ?? 'var(--c-text-weak)'
    const initial = escapeHtml(name.slice(0, 1).toUpperCase())
    const label = escapeHtml(`${name} 추가`)
    const inner = p?.avatarUrl
      ? `<img src="${escapeHtml(p.avatarUrl)}" alt="" class="${avStyles.img}" />`
      : initial
    return `<span class="${avStyles.avatar}" style="background-color:${escapeHtml(color)}" aria-label="${label}" title="${label}">${inner}</span>`
  }
  ```
- [ ] Change the `infoWindowHtml` signature to drop `profiles`/`myId`. Find:
  ```ts
  export function infoWindowHtml(
    place: WithWish<PlaceRow>,
    profiles: ProfileMap,
    myId: string | null,
    state: { visited: boolean; didIReact: boolean; count: number },
  ): string {
  ```
  Replace with:
  ```ts
  // 편차: 장소 말풍선 출처 아바타 제거(ux §2 예외, spec §3.2). profiles/myId 인자 제거.
  export function infoWindowHtml(
    place: WithWish<PlaceRow>,
    state: { visited: boolean; didIReact: boolean; count: number },
  ): string {
  ```
- [ ] In the same function body, remove the avatar call. Find:
  ```ts
      `<span class="${iwStyles.status}">${escapeHtml(statusText)}</span>`,
      meta ? `<span class="${iwStyles.meta}">${meta}</span>` : '',
      avatarHtml(place.added_by, profiles, myId),
      `</div>`,
  ```
  Replace with:
  ```ts
      `<span class="${iwStyles.status}">${escapeHtml(statusText)}</span>`,
      meta ? `<span class="${iwStyles.meta}">${meta}</span>` : '',
      `</div>`,
  ```
- [ ] Update the caller in `src/components/map/NaverMap.tsx`. Find:
  ```tsx
      const html = infoWindowHtml(
        { ...place, wish: place.wish ?? deriveWishStatus(undefined, myId ?? null) },
        profiles ?? {},
        myId ?? null,
        {
          visited: visitedIds?.has(selectedId) ?? false,
          didIReact: reactions?.[selectedId]?.didIReact ?? false,
          count: reactions?.[selectedId]?.count ?? 0,
        },
      )
  ```
  Replace with:
  ```tsx
      const html = infoWindowHtml(
        { ...place, wish: place.wish ?? deriveWishStatus(undefined, myId ?? null) },
        {
          visited: visitedIds?.has(selectedId) ?? false,
          didIReact: reactions?.[selectedId]?.didIReact ?? false,
          count: reactions?.[selectedId]?.count ?? 0,
        },
      )
  ```
  (Leave `profiles`/`myId` props on NaverMap for now — they are still passed by MapPage; the unused-prop cleanup of NaverMap's `profiles` happens implicitly because `myId` is still used by `deriveWishStatus`. Keep `profiles` prop until Task 18; for strict `noUnusedParameters`, props destructured-but-unused on a component are NOT flagged like function params, so this is safe. To be certain, leave `profiles` in the destructure.)
- [ ] Run `npm run test -- src/__tests__/infoWindowHtml.test.ts` → expected PASS.
- [ ] `npm run typecheck` → expected PASS.
- [ ] Commit:
  ```
  git add src/lib/places/infoWindowHtml.ts src/components/map/NaverMap.tsx src/__tests__/infoWindowHtml.test.ts
  git commit -m "$(cat <<'EOF'
  refactor(map): 말풍선 출처 아바타(avatarHtml) 제거 + 시그니처 정리

  infoWindowHtml(place, state) 2-arg로 축소(profiles/myId 인자 삭제). 편차: ux §2 예외(spec §3.2).
  NaverMap 호출부 동기화.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Phase P3: 가봤어요 토글

### Task 7: `useUnmarkVisited` hook (soft-delete active visits, version-conditional)

**Files:**
- Modify: `src/hooks/useVisits.ts` (append a new hook after `useMarkVisited`, lines ~645-665)
- Create: `src/__tests__/unmarkVisited.test.ts` (pure interpret test — exercises the conflict-detection contract via the shared `interpretRows` helper)

Design decision (per research 03 §C / research 04 §9): `useUnmarkVisited(coupleId, myId, onConflict)` takes `{ placeId, visits }` where `visits: VisitRow[]` is the current active visit list (already from `useVisits`, `deleted_at IS NULL`). It soft-deletes ALL active visit rows for that place via `softDelete('visits', id, version, myId)`; any per-row `conflict` status → call `onConflict()` (no silent overwrite). Invalidate `['visits', coupleId]` + `['places', coupleId]`.

- [ ] Write a failing test `src/__tests__/unmarkVisited.test.ts` that locks the conflict contract using the real `interpretRows` (no Supabase needed):
  ```ts
  import { describe, it, expect } from 'vitest'
  import { interpretRows } from '@/lib/sync/versionedUpdate'

  // useUnmarkVisited는 활성 방문행을 version 조건부 soft-delete한다.
  // 0행 반환(서버 version↑) = 충돌 → onConflict 호출(LWW 금지). 그 계약을 interpretRows로 못박는다.
  describe('가봤어요 토글 — 방문 취소 충돌 계약', () => {
    it('soft-delete가 1행을 돌려주면 ok(취소 성공)', () => {
      expect(interpretRows([{ id: 'v1' }]).status).toBe('ok')
    })
    it('soft-delete가 0행이면 conflict(상대가 먼저 수정/삭제) — 무음 덮어쓰기 금지', () => {
      expect(interpretRows([]).status).toBe('conflict')
    })
  })
  ```
- [ ] Run `npm run test -- src/__tests__/unmarkVisited.test.ts` → expected PASS immediately (it pins the contract via existing `interpretRows`). This guards the hook's semantics; the hook itself is wired below and verified by typecheck + the PlaceList toggle test (Task 9).
  > (TDD note: this is a contract-lock test. The behavioral verification of the hook's wiring happens in Task 9's component test, where the toggle button calls `onUnvisit`.)
- [ ] Append `useUnmarkVisited` to `src/hooks/useVisits.ts` (after `useMarkVisited`). Add the import at the top of the file (after the existing imports):
  ```ts
  import { softDelete } from '@/lib/sync/versionedUpdate'
  ```
  Then append:
  ```ts
  // "가봤음 취소"(토글) — 해당 place의 활성 방문행(들)을 soft-delete(deleted_at). 낙관적 락(§4.3):
  // version 조건부 softDelete가 0행이면 충돌 → onConflict(무음 덮어쓰기 금지). 여러 행이면 모두 처리해야
  // "가봤음"(visits 존재) 도출이 해제된다. realtime visits:${coupleId}가 양측에 전파.
  export function useUnmarkVisited(
    coupleId: string | null,
    myId: string | null,
    onConflict: () => void,
  ) {
    const queryClient = useQueryClient()
    return useMutation<void, Error, { placeId: string; visits: VisitRow[] }>({
      mutationFn: async ({ placeId, visits }) => {
        if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
        const active = visits.filter((v) => v.place_id === placeId)
        if (active.length === 0) return
        let conflicted = false
        for (const v of active) {
          const res = await softDelete('visits', v.id, v.version, myId)
          if (res.status === 'conflict') conflicted = true
        }
        if (conflicted) onConflict()
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['visits', coupleId] })
        void queryClient.invalidateQueries({ queryKey: ['places', coupleId] })
      },
    })
  }
  ```
- [ ] `npm run typecheck` → expected PASS.
- [ ] `npm run test -- src/__tests__/unmarkVisited.test.ts` → expected PASS.
- [ ] Commit:
  ```
  git add src/hooks/useVisits.ts src/__tests__/unmarkVisited.test.ts
  git commit -m "$(cat <<'EOF'
  feat(visits): useUnmarkVisited — 활성 방문행 version 조건부 soft-delete(가봤음 취소)

  토글의 취소 경로. 0행=충돌→onConflict(LWW 금지, §4.3). 여러 행이면 모두 soft-delete해야
  "가봤음 = visits 존재" 도출이 해제됨. visits/places invalidate로 마커/카드 갱신.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

### Task 8: infoWindowHtml visit action becomes a toggle (`visit`|`unvisit`)

**Files:**
- Modify: `src/lib/places/infoWindowHtml.ts` (visitAction block, lines ~397-399)
- Modify: `src/__tests__/infoWindowHtml.test.ts` (the "이미 가봤음" test)

- [ ] Update the visited-state test in `src/__tests__/infoWindowHtml.test.ts`. Find:
  ```ts
    it('이미 가봤음이면 가봤어요 액션은 비활성 "가봤음" 상태로 렌더한다(중복 방문 insert 방지, spec §3)', () => {
      const visited = infoWindowHtml(place, { visited: true, didIReact: false, count: 0 })
      const notVisited = infoWindowHtml(place, { visited: false, didIReact: false, count: 0 })
      // 미방문: 누를 수 있는 가봤어요 액션(data-action=visit) 노출.
      expect(notVisited).toContain('data-action="visit"')
      expect(notVisited).toContain('✅ 가봤어요')
      // 방문 후: data-action=visit 버튼은 사라지고 disabled 상태 글리프(가봤음)만.
      expect(visited).not.toContain('data-action="visit"')
      expect(visited).toContain('disabled')
      expect(visited).toContain('✅ 가봤음')
    })
  ```
  Replace with:
  ```ts
    it('방문 액션은 토글: 미방문이면 data-action=visit, 가봤음이면 data-action=unvisit(취소)', () => {
      const visited = infoWindowHtml(place, { visited: true, didIReact: false, count: 0 })
      const notVisited = infoWindowHtml(place, { visited: false, didIReact: false, count: 0 })
      // 미방문: 누를 수 있는 가봤어요 액션(visit).
      expect(notVisited).toContain('data-action="visit"')
      expect(notVisited).toContain('✅ 가봤어요')
      expect(notVisited).not.toContain('data-action="unvisit"')
      // 가봤음: 누르면 취소되는 토글(unvisit). 텍스트로도 취소 가능 표시(§8).
      expect(visited).toContain('data-action="unvisit"')
      expect(visited).toContain('가봤음 (취소)')
      expect(visited).not.toContain('data-action="visit"')
    })
  ```
- [ ] Run `npm run test -- src/__tests__/infoWindowHtml.test.ts` → expected FAIL (current visited branch renders a disabled span, not an `unvisit` button).
- [ ] Edit `src/lib/places/infoWindowHtml.ts`. Replace the `visitAction` block. Find:
  ```ts
    // 이미 가봤음이면 누를 수 있는 visit 액션 대신 비활성 "가봤음" 상태(중복 방문 insert 방지, spec §3).
    const visitAction = state.visited
      ? `<span class="${iwStyles.action} ${iwStyles.actionDone}" aria-disabled="true" data-disabled="true" disabled>✅ 가봤음</span>`
      : `<button type="button" class="${iwStyles.action}" data-action="visit" data-id="${id}" aria-label="${name} 가봤어요로 기록">✅ 가봤어요</button>`
  ```
  Replace with:
  ```ts
    // 방문 토글(spec §3.3): 미방문→가봤어요(visit), 가봤음→취소(unvisit). 색+텍스트 이중화(§8).
    const visitAction = state.visited
      ? `<button type="button" class="${iwStyles.action} ${iwStyles.actionDone}" data-action="unvisit" data-id="${id}" aria-label="${name} 가봤음 기록 취소">✅ 가봤음 (취소)</button>`
      : `<button type="button" class="${iwStyles.action}" data-action="visit" data-id="${id}" aria-label="${name} 가봤어요로 기록">✅ 가봤어요</button>`
  ```
- [ ] Run `npm run test -- src/__tests__/infoWindowHtml.test.ts` → expected PASS.
- [ ] `npm run typecheck` → expected PASS.
- [ ] Commit:
  ```
  git add src/lib/places/infoWindowHtml.ts src/__tests__/infoWindowHtml.test.ts
  git commit -m "$(cat <<'EOF'
  feat(map): 말풍선 방문 버튼 토글화(가봤음→data-action=unvisit 취소)

  비활성 span 대신 토글 버튼. 색(success)+텍스트("가봤음 (취소)") 이중화(§8). spec §3.3.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

### Task 9: PlaceList visited button toggles (`onUnvisit` prop)

**Files:**
- Modify: `src/components/places/PlaceList.tsx` (props + visited branch lines ~474-490)
- Modify: `src/__tests__/placeList.test.tsx` (baseProps + new toggle test)

- [ ] Add the new toggle props + a test to `src/__tests__/placeList.test.tsx`. First extend baseProps. Find:
  ```tsx
    markVisited: { mutate: noop, isPending: false } as never,
    deletePlace: noop,
    deletePending: false,
    onToast: noop,
  }
  ```
  Replace with:
  ```tsx
    markVisited: { mutate: noop, isPending: false } as never,
    onUnvisit: noop,
    unvisitPending: false,
    deletePlace: noop,
    deletePending: false,
    onToast: noop,
  }
  ```
  Then add two tests inside the `describe`:
  ```tsx
    it('가봤음이면 "가봤음 (취소)" 토글 버튼을 렌더하고 클릭 시 onUnvisit(placeId)', () => {
      const onUnvisit = vi.fn()
      render(<PlaceList {...baseProps} visitedIds={new Set(['p1'])} onUnvisit={onUnvisit} />)
      const btn = screen.getByRole('button', { name: /가봤음 기록 취소/ })
      fireEvent.click(btn)
      expect(onUnvisit).toHaveBeenCalledWith('p1')
    })

    it('미방문이면 "다녀왔어요" 버튼(가봤음 취소 버튼 없음)', () => {
      render(<PlaceList {...baseProps} visitedIds={new Set<string>()} />)
      expect(screen.getByRole('button', { name: /다녀왔어요/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /가봤음 기록 취소/ })).not.toBeInTheDocument()
    })
  ```
- [ ] Run `npm run test -- src/__tests__/placeList.test.tsx` → expected FAIL (no `onUnvisit` prop; visited branch renders a static `<span>`, not a button).
- [ ] Edit `src/components/places/PlaceList.tsx`. Add the new props to the destructure. Find:
  ```tsx
    setPriority,
    priorityPending,
    markVisited,
    deletePlace,
    deletePending,
    onToast,
  }: {
  ```
  Replace with:
  ```tsx
    setPriority,
    priorityPending,
    markVisited,
    onUnvisit,
    unvisitPending,
    deletePlace,
    deletePending,
    onToast,
  }: {
  ```
  And in the type block find:
  ```tsx
    markVisited: MarkVisited
    deletePlace: (
  ```
  Replace with:
  ```tsx
    markVisited: MarkVisited
    onUnvisit: (placeId: string) => void
    unvisitPending: boolean
    deletePlace: (
  ```
- [ ] Replace the visited branch (the static span → a toggle button). Find:
  ```tsx
                  {visited ? (
                    <span className={styles.visitedBadge}>✅ 가봤어요</span>
                  ) : (
                    <button
                      type="button"
                      className={styles.visitBtn}
                      onClick={() =>
                        markVisited.mutate(
                          { placeId: p.id },
                          { onSuccess: () => onToast('가봤어요로 기록했어요 ✅') },
                        )
                      }
                      disabled={markVisited.isPending}
                    >
                      다녀왔어요
                    </button>
                  )}
  ```
  Replace with:
  ```tsx
                  {visited ? (
                    // 방문 토글(spec §3.3): 다시 누르면 가봤음 취소(soft-delete). 색+텍스트 이중화(§8).
                    <button
                      type="button"
                      className={styles.visitedBadge}
                      onClick={() => onUnvisit(p.id)}
                      disabled={unvisitPending}
                      aria-label={`${p.name} 가봤음 기록 취소`}
                    >
                      ✅ 가봤음 (취소)
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.visitBtn}
                      onClick={() =>
                        markVisited.mutate(
                          { placeId: p.id },
                          { onSuccess: () => onToast('가봤어요로 기록했어요 ✅') },
                        )
                      }
                      disabled={markVisited.isPending}
                      aria-label={`${p.name} 다녀왔어요`}
                    >
                      다녀왔어요
                    </button>
                  )}
  ```
- [ ] Run `npm run test -- src/__tests__/placeList.test.tsx` → expected PASS.
- [ ] `npm run typecheck` → expected PASS.
- [ ] Commit:
  ```
  git add src/components/places/PlaceList.tsx src/__tests__/placeList.test.tsx
  git commit -m "$(cat <<'EOF'
  feat(places): 가봤어요 카드 버튼 토글화(가봤음→눌러서 취소, onUnvisit)

  정적 ✅ 배지를 토글 버튼으로. 클릭 시 onUnvisit(placeId). aria-label로 취소 의미 안내(§8). spec §3.3.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

### Task 10: Wire unvisit through PlaceSheet + MapPage onAction

**Files:**
- Modify: `src/components/places/PlaceSheet.tsx` (hook + PlaceList wiring, lines ~77, 203-219)
- Modify: `src/pages/MapPage.tsx` (onAction `unvisit` branch + ConflictBanner path, lines ~93-138)

NOTE: PlaceSheet already owns `useConflict()` and a `ConflictBanner`. MapPage does NOT currently render a ConflictBanner. For the map-bubble `unvisit` path we add a lightweight conflict signal in MapPage via its own `useConflict()` + a `ConflictBanner` rendered inside the full-bleed wrap.

- [ ] In `src/components/places/PlaceSheet.tsx`, add the unvisit hook. Find:
  ```tsx
    const markVisited = useMarkVisited(coupleId, myId)
  ```
  Replace with:
  ```tsx
    const markVisited = useMarkVisited(coupleId, myId)
    const unmarkVisited = useUnmarkVisited(coupleId, myId, conflict.flag)
  ```
  And update the import. Find:
  ```tsx
  import { useMarkVisited, type VisitRow } from '@/hooks/useVisits'
  ```
  Replace with:
  ```tsx
  import { useMarkVisited, useUnmarkVisited, type VisitRow } from '@/hooks/useVisits'
  ```
- [ ] Pass `onUnvisit` + `unvisitPending` to `<PlaceList>`. Find:
  ```tsx
            markVisited={markVisited}
            deletePlace={deletePlace}
            deletePending={deletePending}
            onToast={toast.show}
  ```
  Replace with:
  ```tsx
            markVisited={markVisited}
            onUnvisit={(placeId) =>
              unmarkVisited.mutate(
                { placeId, visits },
                { onSuccess: () => toast.show('가봤음 기록을 취소했어요') },
              )
            }
            unvisitPending={unmarkVisited.isPending}
            deletePlace={deletePlace}
            deletePending={deletePending}
            onToast={toast.show}
  ```
  > NOTE: `visits` is the PlaceSheet `visits: VisitRow[]` prop. This task RELIES on that prop still existing. Task 11 (P4) removes TripsSection/TrashSection — Task 11 explicitly KEEPS the `visits` prop because unvisit needs the active rows. To keep tasks independently committable, this task keeps `visits` prop.
- [ ] In `src/pages/MapPage.tsx`, add a `useConflict` + `useUnmarkVisited` and handle `unvisit` in `onAction`. Add imports near the other hook imports:
  ```tsx
  import { useVisits, useMarkVisited, useUnmarkVisited } from '@/hooks/useVisits'
  import { useConflict } from '@/lib/sync/useConflict'
  import { ConflictBanner } from '@/components/common/ConflictBanner'
  ```
  (replace the existing `import { useVisits, useMarkVisited } from '@/hooks/useVisits'` line with the first line above; add the latter two).
- [ ] In MapPage, instantiate the conflict + unmark hooks. Find:
  ```tsx
    const toggleReaction = useToggleReaction(coupleId, myId)
    const markVisited = useMarkVisited(coupleId, myId)
  ```
  Replace with:
  ```tsx
    const conflict = useConflict()
    const toggleReaction = useToggleReaction(coupleId, myId)
    const markVisited = useMarkVisited(coupleId, myId)
    const unmarkVisited = useUnmarkVisited(coupleId, myId, conflict.flag)
  ```
- [ ] Add the `unvisit` branch to `onAction`. Find:
  ```tsx
      } else if (action === 'visit') {
        // 이미 가봤음이면 중복 방문 insert 금지(spec §3 원탭 1건). 말풍선도 비활성 상태로 렌더되지만 이중 가드.
        if (!visitedIds.has(id)) markVisited.mutate({ placeId: id })
      } else if (action === 'react') {
  ```
  Replace with:
  ```tsx
      } else if (action === 'visit') {
        // 미방문일 때만 기록 추가(원탭 1건).
        if (!visitedIds.has(id)) markVisited.mutate({ placeId: id })
      } else if (action === 'unvisit') {
        // 가봤음 취소(토글) — 활성 방문행 soft-delete. 충돌은 conflict.flag로 배너 표시.
        unmarkVisited.mutate({ placeId: id, visits: visits ?? [] })
      } else if (action === 'react') {
  ```
- [ ] Render a ConflictBanner inside the map wrap so map-bubble conflicts surface. Find:
  ```tsx
          <div className={styles.mapWrap}>
            {/* 검색바는 시트가 아니라 지도 위 상단 오버레이(spec §5) — peek에서도 도달, ≤3탭 보존. */}
            {coupleActive ? <MapSearchOverlay coupleId={coupleId} /> : null}
  ```
  Replace with:
  ```tsx
          <div className={styles.mapWrap}>
            {conflict.conflict ? (
              <div className={styles.bannerOverlay}>
                <ConflictBanner onDismiss={conflict.clear} />
              </div>
            ) : null}
            {/* 검색바는 시트가 아니라 지도 위 상단 오버레이(spec §5) — peek에서도 도달, ≤3탭 보존. */}
            {coupleActive ? <MapSearchOverlay coupleId={coupleId} /> : null}
  ```
- [ ] Append a `.bannerOverlay` rule to `src/pages/MapPage.module.css`:
  ```css
  /* 지도 위 충돌 배너 — 검색 오버레이와 같은 z 레이어(시트 45 < 오버레이 50). */
  .bannerOverlay {
    position: absolute;
    top: calc(var(--safe-top) + var(--sp-2));
    left: var(--sp-3);
    right: var(--sp-3);
    max-width: 480px;
    margin: 0 auto;
    z-index: 50;
  }
  ```
- [ ] `npm run typecheck` → expected PASS.
- [ ] `npm run test -- src/__tests__/placeSheet.test.tsx` → expected PASS (PlaceSheet still receives `visits` prop here; TripsSection mock still present).
- [ ] Commit:
  ```
  git add src/components/places/PlaceSheet.tsx src/pages/MapPage.tsx src/pages/MapPage.module.css
  git commit -m "$(cat <<'EOF'
  feat(map): 가봤어요 토글 와이어링(PlaceSheet/말풍선 unvisit → useUnmarkVisited)

  PlaceSheet은 onUnvisit으로 visits행 soft-delete. MapPage.onAction은 unvisit 분기 추가 +
  지도 위 ConflictBanner로 충돌 표시(§4.3). 토스트 안내 포함.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Phase P4: 휴지통→우리 / 여행 숨김

### Task 11: PlaceSheet drops TripsSection + TrashSection (and their hooks/state)

**Files:**
- Modify: `src/components/places/PlaceSheet.tsx` (imports lines 34-39, hooks lines 79-82, render lines 221-229)
- Modify: `src/__tests__/placeSheet.test.tsx` (remove TripsSection mock + rewrite the "필터·여행 섹션" test + drop `visits` from props)

- [ ] Update `src/__tests__/placeSheet.test.tsx`. Remove the TripsSection mock block:
  ```tsx
  // TripsSection은 useTrips를 쓰므로 가벼운 QueryClient만 있으면 되지만 렌더 단순화를 위해 mock.
  vi.mock('@/components/places/TripsSection', () => ({
    TripsSection: () => <div data-testid="trips-section" />,
  }))
  ```
  (delete it). Then drop `visits: []` from the `renderSheet` default props and from the inline `Harness` (both spots). In `renderSheet`, find:
  ```tsx
      wishes: { byPlace: {}, mine: {} },
      visits: [],
      visitedIds: new Set<string>(),
  ```
  Replace with:
  ```tsx
      wishes: { byPlace: {}, mine: {} },
      visitedIds: new Set<string>(),
  ```
  In the inline `Harness` find:
  ```tsx
            wishes={{ byPlace: {}, mine: {} }}
            visits={[]}
            visitedIds={new Set<string>()}
  ```
  Replace with:
  ```tsx
            wishes={{ byPlace: {}, mine: {} }}
            visitedIds={new Set<string>()}
  ```
  Rewrite the "필터·여행 섹션" test to assert trips/trash are NOT rendered:
  ```tsx
    it('연결 상태면 필터·목록을 호스팅하되 여행/휴지통 섹션은 더는 렌더하지 않는다(P4)', () => {
      renderSheet()
      expect(screen.queryByTestId('place-search')).not.toBeInTheDocument()
      expect(screen.queryByTestId('trips-section')).not.toBeInTheDocument()
      // 휴지통 토글은 '우리' 탭으로 이동 — 시트엔 없음.
      expect(screen.queryByRole('button', { name: /휴지통/ })).not.toBeInTheDocument()
      expect(screen.getByRole('group', { name: '장소 필터' })).toBeInTheDocument()
    })
  ```
- [ ] Run `npm run test -- src/__tests__/placeSheet.test.tsx` → expected FAIL (PlaceSheet still renders TripsSection/TrashSection; the inline Harness/props with `visits` removed will TS-error against the still-present `visits` prop).
- [ ] Edit `src/components/places/PlaceSheet.tsx`. Remove imports. Find and delete:
  ```tsx
  import { TripsSection } from '@/components/places/TripsSection'
  ```
  and
  ```tsx
  import { TrashSection } from '@/components/places/TrashSection'
  ```
  Change the visits/trash hook imports. Find:
  ```tsx
  import { useMarkVisited, useUnmarkVisited, type VisitRow } from '@/hooks/useVisits'
  import { useSetWishPriority } from '@/hooks/useSetWishPriority'
  import { useTrashPlaces, useDeletePlace, useRestorePlace } from '@/hooks/usePlaceTrash'
  ```
  Replace with:
  ```tsx
  import { useMarkVisited, useUnmarkVisited, type VisitRow } from '@/hooks/useVisits'
  import { useSetWishPriority } from '@/hooks/useSetWishPriority'
  import { useDeletePlace } from '@/hooks/usePlaceTrash'
  ```
- [ ] Remove the trash hooks/state. Find:
  ```tsx
    const { deletePlace, isPending: deletePending } = useDeletePlace(coupleId, myId, conflict.flag)
    const { restorePlace, isPending: restorePending } = useRestorePlace(coupleId, myId, conflict.flag)
    const [trashOpen, setTrashOpen] = useState(false)
    const { data: trash } = useTrashPlaces(coupleId, trashOpen)
    const [placeFilter, setPlaceFilter] = useState<'all' | 'wish' | 'visited'>('all')
  ```
  Replace with:
  ```tsx
    const { deletePlace, isPending: deletePending } = useDeletePlace(coupleId, myId, conflict.flag)
    const [placeFilter, setPlaceFilter] = useState<'all' | 'wish' | 'visited'>('all')
  ```
- [ ] Remove the TripsSection + TrashSection JSX. Find:
  ```tsx
            <TripsSection coupleId={coupleId} myId={myId} visits={visits} />

            <TrashSection
              open={trashOpen}
              onToggle={() => setTrashOpen((v) => !v)}
              items={trash ?? []}
              busy={restorePending}
              onRestore={(t) => restorePlace({ id: t.id, expectedVersion: t.version })}
            />
  ```
  Replace with:
  ```tsx
            {/* 여행 섹션은 코드 보존하되 시트에서 숨김(spec §3.4). 휴지통은 '우리' 탭으로 이동(Task 12). */}
  ```
- [ ] KEEP the `visits: VisitRow[]` prop (still needed by `useUnmarkVisited`/`onUnvisit`) and KEEP `import { useMarkVisited, useUnmarkVisited, type VisitRow } from '@/hooks/useVisits'`. Only remove TripsSection + TrashSection JSX and the trash hooks/state (`useTrashPlaces`/`useRestorePlace`/`trashOpen`/`restorePlace`) — done in the steps above. Do NOT remove `visits` from the destructure or type, and do NOT remove `VisitRow`. No task removes the `visits` prop.
  > FINAL state for this task: `visits` prop KEPT (used by onUnvisit). TripsSection + TrashSection removed. `useTrashPlaces`/`useRestorePlace`/`trashOpen`/`restorePlace` removed. The placeSheet test keeps `visits: []` in props.
  - Because the `visits` prop is kept, the test must also keep it: REVERT the test edits that dropped `visits` — restore `visits: []` in `renderSheet` defaults and `visits={[]}` in the inline Harness. (Keep the TripsSection-mock removal and the rewritten "no trips/trash" assertion.)
- [ ] Run `npm run test -- src/__tests__/placeSheet.test.tsx` → expected PASS.
- [ ] `npm run typecheck` → expected PASS.
- [ ] Commit:
  ```
  git add src/components/places/PlaceSheet.tsx src/__tests__/placeSheet.test.tsx
  git commit -m "$(cat <<'EOF'
  refactor(places): PlaceSheet에서 여행/휴지통 섹션 제거(코드 보존, 시트만 정리)

  TripsSection·TrashSection 렌더 + useTrashPlaces/useRestorePlace/trashOpen 제거.
  visits prop은 가봤음 취소(useUnmarkVisited) 때문에 유지. 시트 본문 = 필터+PlaceList. spec §3.4.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

### Task 12: UsPage gains TrashSection (useTrashPlaces/useRestorePlace)

**Files:**
- Modify: `src/pages/UsPage.tsx` (imports + hooks + render between 내보내기 and 연결 해제)
- Modify: `src/__tests__/routing.test.tsx` (wrap `renderAt` in OfflineQueueProvider — TrashSection's useRestorePlace calls useOfflineQueue)
- Create: `src/__tests__/usPageTrash.test.tsx`

- [ ] Wrap `renderAt` in `OfflineQueueProvider` in `src/__tests__/routing.test.tsx` (UsPage now mounts `useRestorePlace` → `useOfflineQueue`). Add the import after the existing imports:
  ```tsx
  import { OfflineQueueProvider } from '@/state/OfflineQueueProvider'
  ```
  Then find:
  ```tsx
    return render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  ```
  Replace with:
  ```tsx
    return render(
      <QueryClientProvider client={qc}>
        <OfflineQueueProvider>
          <RouterProvider router={router} />
        </OfflineQueueProvider>
      </QueryClientProvider>,
    )
  ```
- [ ] Write a failing test `src/__tests__/usPageTrash.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from 'vitest'
  import { render, screen, fireEvent } from '@testing-library/react'
  import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
  import { MemoryRouter } from 'react-router-dom'

  vi.mock('@/state/auth', () => ({
    useAuth: () => ({ user: { id: 'u1' }, session: { user: { id: 'u1' } }, configured: true, initializing: false }),
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  }))
  vi.mock('@/hooks/useCouple', () => ({
    useCouple: () => ({
      data: { coupleId: 'c1', status: 'ACTIVE', userA: 'u1', userB: 'u2', connectedAt: null, partner: null },
      isLoading: false,
    }),
  }))
  vi.mock('@/hooks/useSignOut', () => ({ useSignOut: () => () => {} }))
  vi.mock('@/hooks/useCoupleInvite', () => ({ useDisconnectCouple: () => ({ mutate: () => {}, isPending: false }) }))
  vi.mock('@/hooks/usePlaceTrash', () => ({
    useTrashPlaces: () => ({ data: [{ id: 't1', name: '삭제한 카페', address: null, region_label: null, deleted_at: '2026-06-01', version: 1 }] }),
    useRestorePlace: () => ({ restorePlace: vi.fn(), isPending: false }),
  }))

  import { OfflineQueueProvider } from '@/state/OfflineQueueProvider'
  import UsPage from '@/pages/UsPage'

  function renderUs() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={qc}>
        <OfflineQueueProvider>
          <MemoryRouter>
            <UsPage />
          </MemoryRouter>
        </OfflineQueueProvider>
      </QueryClientProvider>,
    )
  }

  describe('UsPage 휴지통 섹션(P4 — 시트에서 우리 탭으로 이동)', () => {
    it('휴지통 토글을 열면 삭제된 장소와 복구 버튼이 보인다', () => {
      renderUs()
      const toggle = screen.getByRole('button', { name: /휴지통/ })
      fireEvent.click(toggle)
      expect(screen.getByText('삭제한 카페')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '복구' })).toBeInTheDocument()
    })
  })
  ```
- [ ] Run `npm run test -- src/__tests__/usPageTrash.test.tsx` → expected FAIL (UsPage has no TrashSection yet).
- [ ] Edit `src/pages/UsPage.tsx`. Add imports after the existing block:
  ```tsx
  import { TrashSection } from '@/components/places/TrashSection'
  import { useTrashPlaces, useRestorePlace } from '@/hooks/usePlaceTrash'
  import { useConflict } from '@/lib/sync/useConflict'
  import { ConflictBanner } from '@/components/common/ConflictBanner'
  ```
- [ ] Add hooks inside `UsPage` after `const cancelRef = ...`. Find:
  ```tsx
    const cancelRef = useRef<HTMLButtonElement>(null)
  ```
  Replace with:
  ```tsx
    const cancelRef = useRef<HTMLButtonElement>(null)
    const myId = user?.id ?? null
    const conflict = useConflict()
    const [trashOpen, setTrashOpen] = useState(false)
    const { data: trash } = useTrashPlaces(couple?.coupleId ?? null, trashOpen)
    const { restorePlace, isPending: restorePending } = useRestorePlace(
      couple?.coupleId ?? null,
      myId,
      conflict.flag,
    )
  ```
- [ ] Insert the TrashSection card between the 내보내기 section and the 연결 해제 section. Find the closing of the 내보내기 block followed by 연결 해제:
  ```tsx
          ) : null}

          {/* 연결 해제 */}
          {couple?.status === 'ACTIVE' ? (
  ```
  Replace with:
  ```tsx
          ) : null}

          {/* 휴지통(P4) — 시트에서 우리 탭으로 이동. 삭제는 복구 가능(soft-delete, §4.3). */}
          {couple?.coupleId ? (
            <section className={styles.card} aria-label="휴지통">
              {conflict.conflict ? <ConflictBanner onDismiss={conflict.clear} /> : null}
              <TrashSection
                open={trashOpen}
                onToggle={() => setTrashOpen((v) => !v)}
                items={trash ?? []}
                busy={restorePending}
                onRestore={(t) => restorePlace({ id: t.id, expectedVersion: t.version })}
              />
            </section>
          ) : null}

          {/* 연결 해제 */}
          {couple?.status === 'ACTIVE' ? (
  ```
- [ ] Run `npm run test -- src/__tests__/usPageTrash.test.tsx` → expected PASS.
- [ ] Run `npm run test -- src/__tests__/routing.test.tsx` → expected PASS (OfflineQueueProvider now wraps; `/us` renders the real UsPage with the trash hook).
- [ ] `npm run typecheck` → expected PASS.
- [ ] Commit:
  ```
  git add src/pages/UsPage.tsx src/__tests__/usPageTrash.test.tsx src/__tests__/routing.test.tsx
  git commit -m "$(cat <<'EOF'
  feat(us): 휴지통 섹션을 '우리' 탭으로 이동(useTrashPlaces/useRestorePlace 재사용)

  내보내기와 연결해제 사이에 TrashSection 카드 + 충돌 배너. 복구 UI 유지(spec §3.4).
  routing 테스트는 OfflineQueueProvider로 감싸 useOfflineQueue 의존 충족.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Phase P5: 내 위치

### Task 13: `currentPosition` pure geolocation wrapper + unit test

**Files:**
- Create: `src/lib/geo/currentPosition.ts`
- Create: `src/__tests__/currentPosition.test.ts`

- [ ] Write a failing test `src/__tests__/currentPosition.test.ts` (inject a fake `geolocation` so it is pure/mockable):
  ```ts
  import { describe, it, expect } from 'vitest'
  import { getCurrentPosition } from '@/lib/geo/currentPosition'

  function geoOk(lat: number, lng: number): Geolocation {
    return {
      getCurrentPosition: (success) =>
        success({ coords: { latitude: lat, longitude: lng } } as GeolocationPosition),
      watchPosition: () => 0,
      clearWatch: () => {},
    }
  }
  function geoErr(code: number): Geolocation {
    return {
      getCurrentPosition: (_s, error) => error?.({ code } as GeolocationPositionError),
      watchPosition: () => 0,
      clearWatch: () => {},
    }
  }

  describe('getCurrentPosition (순수 래퍼)', () => {
    it('성공 시 ok + lat/lng를 정규화해 돌려준다', async () => {
      const r = await getCurrentPosition({ geo: geoOk(37.5, 127.0) })
      expect(r).toEqual({ ok: true, lat: 37.5, lng: 127.0 })
    })

    it('미지원이면 unsupported', async () => {
      const r = await getCurrentPosition({ geo: null })
      expect(r).toEqual({ ok: false, reason: 'unsupported' })
    })

    it('권한 거부(code 1)는 denied', async () => {
      const r = await getCurrentPosition({ geo: geoErr(1) })
      expect(r).toEqual({ ok: false, reason: 'denied' })
    })

    it('위치 불가(code 2)는 unavailable', async () => {
      const r = await getCurrentPosition({ geo: geoErr(2) })
      expect(r).toEqual({ ok: false, reason: 'unavailable' })
    })

    it('타임아웃(code 3)은 timeout', async () => {
      const r = await getCurrentPosition({ geo: geoErr(3) })
      expect(r).toEqual({ ok: false, reason: 'timeout' })
    })
  })
  ```
- [ ] Run `npm run test -- src/__tests__/currentPosition.test.ts` → expected FAIL (module does not exist).
- [ ] Create `src/lib/geo/currentPosition.ts`:
  ```ts
  // 현재 위치 순수 래퍼(spec §3.5) — navigator.geolocation을 Promise로 감싸고 에러를 정규화한다.
  // geo를 주입 가능하게 해서 vitest에서 모킹(테스트 용이). 권한 요청은 호출 시점(맥락 요청, security §3.1).
  export type GeoResult =
    | { ok: true; lat: number; lng: number }
    | { ok: false; reason: 'unsupported' | 'denied' | 'unavailable' | 'timeout' }

  type Options = {
    geo?: Geolocation | null
    timeoutMs?: number
  }

  // 미지정 시 브라우저 navigator.geolocation 사용(없으면 null → unsupported).
  function resolveGeo(injected: Geolocation | null | undefined): Geolocation | null {
    if (injected !== undefined) return injected
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) return navigator.geolocation
    return null
  }

  // GeolocationPositionError code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT.
  function reasonForCode(code: number): 'denied' | 'unavailable' | 'timeout' {
    if (code === 1) return 'denied'
    if (code === 3) return 'timeout'
    return 'unavailable'
  }

  export function getCurrentPosition(opts: Options = {}): Promise<GeoResult> {
    const geo = resolveGeo(opts.geo)
    if (!geo) return Promise.resolve({ ok: false, reason: 'unsupported' })
    const timeout = opts.timeoutMs ?? 8000
    return new Promise<GeoResult>((resolve) => {
      geo.getCurrentPosition(
        (pos) => resolve({ ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => resolve({ ok: false, reason: reasonForCode(err.code) }),
        { enableHighAccuracy: false, timeout, maximumAge: 60_000 },
      )
    })
  }
  ```
- [ ] Run `npm run test -- src/__tests__/currentPosition.test.ts` → expected PASS.
- [ ] `npm run typecheck` → expected PASS.
- [ ] Commit:
  ```
  git add src/lib/geo/currentPosition.ts src/__tests__/currentPosition.test.ts
  git commit -m "$(cat <<'EOF'
  feat(geo): currentPosition 순수 래퍼(Promise·타임아웃·에러 정규화)

  navigator.geolocation을 주입 가능 Promise로 래핑. denied/unavailable/timeout/unsupported로
  정규화(테스트 용이). 권한은 호출 시점 맥락 요청(security §3.1). spec §3.5.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

### Task 14: NaverMap initial centering refactor (geolocation once) + '내 위치' button

**Files:**
- Modify: `src/components/map/NaverMap.tsx` (init effect, marker-rebuild effect fitBounds removal, new centering effect, new button)
- Modify: `src/components/map/NaverMap.module.css` (add `.myLocBtn`)

- [ ] In `src/components/map/NaverMap.tsx`, add the import:
  ```tsx
  import { getCurrentPosition } from '@/lib/geo/currentPosition'
  ```
- [ ] Add a `centeredRef` (ensures one-time auto-centering) and a denial-toast state. Find the existing refs block ending:
  ```tsx
    const [error, setError] = useState<string | null>(null)
    const [ready, setReady] = useState(false)
  ```
  Replace with:
  ```tsx
    const [error, setError] = useState<string | null>(null)
    const [ready, setReady] = useState(false)
    const [locToast, setLocToast] = useState<string | null>(null)
    // 초기 센터링은 ready 직후 1회만(이후 마커 변경으로 지도가 튀지 않게, spec §3.5).
    // centeredRef: 한 번이라도 센터를 잡았으면(내 위치 성공 또는 저장장소 fitBounds) true → 더는 자동 이동 안 함.
    // geoSettledRef: geolocation 응답(성공/실패)이 왔는지. 실패로 끝났는데 그 시점 places가 비어 있던 경우,
    //   places가 나중에 채워지면 저장장소 fitBounds 폴백을 1회 재평가하기 위한 게이트(빈→채움 순서 가드, spec §2 폴백 체인).
    const centeredRef = useRef(false)
    const geoSettledRef = useRef<'pending' | 'ok' | 'failed'>('pending')
  ```
- [ ] Remove the per-`places` `fitBounds`/`setCenter` from the marker-rebuild effect. Find:
  ```tsx
      if (pts.length > 1) map.fitBounds(bounds)
      else map.setCenter(new nv.maps.LatLng(pts[0]!.lat!, pts[0]!.lng!))
      // visitedIds는 deps에서 제외: 방문 토글로 마커를 통째로 재생성하면 fitBounds가 재실행돼
  ```
  Replace with:
  ```tsx
      // 자동 센터링은 마커 변경마다 하지 않는다(지도 튐 방지, spec §3.5). 초기 센터링은 별도 1회 효과가 담당.
      // bounds는 geolocation 실패 시 폴백 fitBounds에서만 쓰이므로 여기선 계산만 하고 적용하지 않는다.
      void bounds
      // visitedIds는 deps에서 제외: 방문 토글로 마커를 통째로 재생성하면 fitBounds가 재실행돼
  ```
- [ ] Add the geolocation centering effect right after the marker-rebuild effect (before the highlight effect). This fires once on `ready`; on SUCCESS it centers on my location and marks `centeredRef`. On FAILURE it does NOT touch the map here — it only records `geoSettledRef='failed'` so the separate fallback effect below can run the saved-place fitBounds whenever places are (or become) non-empty. This fixes the empty-then-populated race (geo resolving before `places` load — spec §2 fallback chain, research 02 §3(1)). Insert:
  ```tsx
    // 초기 센터링 1/2 — geolocation 시도(ready 직후 1회, spec §3.5).
    // 성공: 내 위치 setCenter+zoom 14, centeredRef로 고정(이후 자동 이동 없음).
    // 실패/거부/미지원: 여기서 지도를 건드리지 않고 geoSettledRef='failed'만 기록 →
    //   저장장소 fitBounds 폴백은 아래 별도 효과가 places 적재 시점에 맞춰 1회 수행(빈→채움 순서 가드).
    useEffect(() => {
      const nv = window.naver
      const map = mapRef.current
      if (!ready || !nv || !map || geoSettledRef.current !== 'pending') return
      let cancelled = false
      void getCurrentPosition().then((r) => {
        if (cancelled || !mapRef.current) return
        if (r.ok) {
          geoSettledRef.current = 'ok'
          centeredRef.current = true
          mapRef.current.setCenter(new nv.maps.LatLng(r.lat, r.lng))
          mapRef.current.setZoom(14)
        } else {
          // 실패 — best-effort 폴백은 places 효과에 위임(아래). 의도적으로 지도는 그대로(서울 초기 center).
          geoSettledRef.current = 'failed'
        }
      })
      return () => {
        cancelled = true
      }
    }, [ready])
  ```
- [ ] Add the saved-place fitBounds fallback effect right after the geolocation effect. It is gated on `geoSettledRef==='failed' && !centeredRef && places non-empty`, so it runs whether places were already loaded OR arrive later (deps include `places`). It self-fences via `centeredRef` so it only fits bounds once. If geolocation succeeds, `geoSettledRef==='ok'` and this never runs (success ignores saved places per spec §2). Insert:
  ```tsx
    // 초기 센터링 2/2 — geolocation 실패 시 저장장소 폴백(best-effort, spec §2).
    // geo가 places보다 먼저 실패로 끝나면 이 효과는 places가 채워지는 순간 1회 fitBounds(빈→채움 순서 가드).
    // 저장장소가 끝까지 없으면 서울 초기 center 유지. centeredRef로 1회만(이후 마커/줌 변경엔 반응 안 함).
    useEffect(() => {
      const nv = window.naver
      const map = mapRef.current
      if (!ready || !nv || !map) return
      if (geoSettledRef.current !== 'failed' || centeredRef.current) return
      const pts = places.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number')
      if (pts.length === 0) return
      centeredRef.current = true
      const b = new nv.maps.LatLngBounds(
        new nv.maps.LatLng(pts[0]!.lat!, pts[0]!.lng!),
        new nv.maps.LatLng(pts[0]!.lat!, pts[0]!.lng!),
      )
      for (const p of pts) b.extend(new nv.maps.LatLng(p.lat!, p.lng!))
      map.fitBounds(b)
    }, [ready, places])
  ```
  > NOTE: this SDK-driven fallback selection (geolocation → saved fitBounds → Seoul) is **not unit-testable** (it calls the live Naver SDK). The pure `getCurrentPosition` wrapper is covered in Task 13; the runtime fallback ordering is intentionally best-effort and verified by the manual a11y/visual spot-check (Task 21): denying location should land on saved-place bounds (or Seoul when none).
- [ ] Add a '내 위치' button handler + clear-toast effect. Add this handler inside the component (above the `if (error)` return):
  ```tsx
    // '내 위치' 버튼 — 현재 위치 재요청 후 panTo. 거부/실패면 토스트(최소 폴백, spec §3.5).
    const recenter = () => {
      const nv = window.naver
      const map = mapRef.current
      if (!nv || !map) return
      void getCurrentPosition().then((r) => {
        if (r.ok) {
          map.panTo(new nv.maps.LatLng(r.lat, r.lng))
          map.setZoom(14)
          setLocToast(null)
        } else {
          setLocToast(
            r.reason === 'denied'
              ? '위치 권한이 꺼져 있어요. 브라우저 설정에서 허용해 주세요.'
              : '현재 위치를 가져오지 못했어요.',
          )
          window.setTimeout(() => setLocToast(null), 3000)
        }
      })
    }
  ```
- [ ] Replace the final `return` so it renders the map + the floating button + a denial toast. Find:
  ```tsx
    return <div ref={elRef} className={styles.map} aria-label="장소 지도" />
  ```
  Replace with:
  ```tsx
    return (
      <div className={styles.mapHost}>
        <div ref={elRef} className={styles.map} aria-label="장소 지도" />
        <button type="button" className={styles.myLocBtn} onClick={recenter} aria-label="내 위치로 이동">
          📍
        </button>
        {locToast ? (
          <div className={styles.locToast} role="status" aria-live="polite">
            {locToast}
          </div>
        ) : null}
      </div>
    )
  ```
- [ ] Add styles to `src/components/map/NaverMap.module.css`:
  ```css
  /* 지도 호스트 — 풀블리드 영역을 채우고 플로팅 버튼/토스트를 절대배치할 기준. */
  .mapHost {
    position: relative;
    width: 100%;
    height: 100%;
    flex: 1;
    min-height: 0;
  }

  /* '내 위치' 플로팅 버튼 — 우하단, peek 시트 위(spec §3.5). 터치 타깃 ≥44px.
     peek 밴드(--sheet-peek-h)는 viewport 하단에서 측정되고 시트가 safe-area를 자체 흡수하므로
     --safe-bottom을 추가하지 않는다(이중 가산 금지, research 01 §10). */
  .myLocBtn {
    position: absolute;
    right: var(--sp-3);
    bottom: calc(var(--sheet-peek-h) + var(--sp-3));
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 1px solid var(--c-border);
    background: var(--c-surface);
    color: var(--c-text);
    font-size: 1.25rem;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
    cursor: pointer;
    z-index: 40;
  }

  /* 위치 실패/거부 토스트 — 하단 중앙, 시트 위. peek 밴드는 viewport 하단 측정 + 시트가
     safe-area 자체 흡수 → --safe-bottom 추가 안 함(이중 가산 금지, research 01 §10). */
  .locToast {
    position: absolute;
    left: 50%;
    bottom: calc(var(--sheet-peek-h) + var(--sp-6));
    transform: translateX(-50%);
    max-width: 90%;
    background: var(--c-text);
    color: var(--c-bg);
    padding: var(--sp-2) var(--sp-4);
    border-radius: 999px;
    font-size: var(--fs-caption);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    z-index: 41;
  }
  ```
- [ ] `npm run typecheck` → expected PASS.
- [ ] `npm run test -- src/__tests__/markerVisual.test.ts src/__tests__/selectedMarker.test.ts` → expected PASS (regression — pure marker helpers unchanged).
- [ ] Commit:
  ```
  git add src/components/map/NaverMap.tsx src/components/map/NaverMap.module.css
  git commit -m "$(cat <<'EOF'
  feat(map): 내 위치 중심 초기화 + '내 위치' 플로팅 버튼(거부 시 토스트 폴백)

  마커 변경마다 fitBounds 하던 동작 제거 → ready 직후 1회 geolocation(성공:내위치 zoom14,
  실패:저장장소 있으면 fitBounds·없으면 서울). 우하단 플로팅 버튼은 peek 밴드 위(safe-area는
  peek가 흡수, 이중가산 없음). 저장장소 폴백은 places 적재 후 별도 효과로 재평가(빈→채움 순서 가드). spec §3.5.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Phase P6: 검색 개편

### Task 15: `previewWindowHtml` builder (pure) + test

**Files:**
- Modify: `src/lib/places/infoWindowHtml.ts` (append `previewWindowHtml`)
- Create: `src/__tests__/previewWindowHtml.test.ts`

- [ ] Write a failing test `src/__tests__/previewWindowHtml.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest'
  import { previewWindowHtml } from '@/lib/places/infoWindowHtml'
  import type { KakaoPlaceHit } from '@/lib/kakao/types'

  const hit: KakaoPlaceHit = {
    kakaoPlaceId: 'k1',
    name: '속초 "칠성조선소',
    address: '강원 속초시',
    lat: 38,
    lng: 128.5,
    category: '카페',
    placeUrl: 'https://x',
  }

  describe('previewWindowHtml (검색 프리뷰 말풍선 — 순수)', () => {
    it('이름을 이스케이프하고 카테고리·주소를 포함한다', () => {
      const html = previewWindowHtml(hit)
      expect(html).toContain('속초 &quot;칠성조선소')
      expect(html).toContain('카페')
      expect(html).toContain('강원 속초시')
    })

    it('[저장]·[길찾기] 액션에 data-action(save/directions)과 data-id(kakaoPlaceId)를 부여한다', () => {
      const html = previewWindowHtml(hit)
      expect(html).toContain('data-action="save"')
      expect(html).toContain('data-action="directions"')
      expect(html).toContain('data-action="close"')
      expect(html).toContain('data-id="k1"')
    })

    it('class="undefined"가 없어야 한다(CSS module 누락 회귀 방지)', () => {
      expect(previewWindowHtml(hit)).not.toContain('class="undefined"')
    })
  })
  ```
- [ ] Run `npm run test -- src/__tests__/previewWindowHtml.test.ts` → expected FAIL (no `previewWindowHtml` export).
- [ ] Append `previewWindowHtml` to `src/lib/places/infoWindowHtml.ts`. Add the import at the top (after the existing imports):
  ```ts
  import type { KakaoPlaceHit } from '@/lib/kakao/types'
  ```
  Then append at the end of the file:
  ```ts
  // 검색 프리뷰 말풍선(spec §3.6) — 아직 저장 안 한 후보. 이름·카테고리·주소 + [저장]/[길찾기].
  // data-id는 kakaoPlaceId(프리뷰는 placeId가 아직 없음). 순수 함수(테스트로 못박음).
  export function previewWindowHtml(hit: KakaoPlaceHit): string {
    const name = escapeHtml(hit.name)
    const id = escapeHtml(hit.kakaoPlaceId)
    const meta = [hit.category, hit.address]
      .filter((x): x is string => Boolean(x))
      .map((x) => escapeHtml(x))
      .join(' · ')
    return [
      `<div class="${iwStyles.bubble}" role="dialog" aria-label="${name} 검색 결과">`,
      `<button type="button" class="${iwStyles.close}" data-action="close" data-id="${id}" aria-label="닫기">✕</button>`,
      `<div class="${iwStyles.head}">`,
      `<span class="${iwStyles.glyph}" aria-hidden>＋</span>`,
      `<span class="${iwStyles.name}">${name}</span>`,
      `</div>`,
      meta ? `<div class="${iwStyles.sub}"><span class="${iwStyles.meta}">${meta}</span></div>` : '',
      `<div class="${iwStyles.actions}">`,
      `<button type="button" class="${iwStyles.action}" data-action="save" data-id="${id}" aria-label="${name} 저장">⭐ 저장</button>`,
      `<button type="button" class="${iwStyles.action}" data-action="directions" data-id="${id}" aria-label="${name} 길찾기">🧭 길찾기</button>`,
      `</div>`,
      `</div>`,
    ].join('')
  }
  ```
- [ ] Run `npm run test -- src/__tests__/previewWindowHtml.test.ts` → expected PASS.
- [ ] `npm run typecheck` → expected PASS.
- [ ] Commit:
  ```
  git add src/lib/places/infoWindowHtml.ts src/__tests__/previewWindowHtml.test.ts
  git commit -m "$(cat <<'EOF'
  feat(map): previewWindowHtml — 검색 프리뷰 말풍선 빌더(저장/길찾기, 순수)

  미저장 후보용 말풍선. 글리프 ＋로 저장 핀과 모양 구분(§8). data-id=kakaoPlaceId.
  data-action save/directions/close. spec §3.6.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

### Task 16: PlaceSearch — `savedKakaoIds` + saved indicator + delegated `onPick` (no immediate save)

**Files:**
- Modify: `src/components/places/PlaceSearch.tsx` (props, drop internal save, add indicator, results max-height)
- Modify: `src/components/places/PlaceSearch.module.css` (add `.savedTag`, `.results` max-height)
- Modify: `src/components/places/MapSearchOverlay.tsx` (thread `savedKakaoIds` + `onPick`)
- Modify: `src/__tests__/mapSearchOverlay.test.tsx` (mock now forwards new props)
- Create: `src/__tests__/placeSearch.test.tsx`

- [ ] Write a failing test `src/__tests__/placeSearch.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from 'vitest'
  import { render, screen, fireEvent } from '@testing-library/react'
  import type { KakaoPlaceHit } from '@/lib/kakao/types'

  const hits: KakaoPlaceHit[] = [
    { kakaoPlaceId: 'saved1', name: '저장된 카페', address: '속초', lat: 38, lng: 128, category: '카페', placeUrl: '' },
    { kakaoPlaceId: 'new1', name: '새 식당', address: '강릉', lat: 37.7, lng: 128.9, category: '식당', placeUrl: '' },
  ]

  // useKakaoSearch를 done+hits 상태로 모킹(검색 호출 없이 결과 렌더).
  vi.mock('@/hooks/useKakaoSearch', () => ({
    useKakaoSearch: () => ({ query: '카', setQuery: () => {}, clear: () => {}, status: 'done', hits, error: null }),
  }))

  import { PlaceSearch } from '@/components/places/PlaceSearch'

  describe('PlaceSearch (검색 개편 — 프리뷰/선택 위임 + 저장됨 표시)', () => {
    it('저장된 결과엔 ★+"저장됨" 표시, 미저장엔 없음(색+모양 이중화)', () => {
      render(<PlaceSearch coupleId="c1" savedKakaoIds={new Set(['saved1'])} onPick={() => {}} />)
      expect(screen.getByText('저장된 카페').closest('button')).toHaveTextContent('저장됨')
      expect(screen.getByText('새 식당').closest('button')).not.toHaveTextContent('저장됨')
    })

    it('결과 탭 시 즉시 저장하지 않고 onPick(hit)을 호출한다(≤3탭: 프리뷰에서 저장)', () => {
      const onPick = vi.fn()
      render(<PlaceSearch coupleId="c1" savedKakaoIds={new Set<string>()} onPick={onPick} />)
      fireEvent.click(screen.getByText('새 식당'))
      expect(onPick).toHaveBeenCalledTimes(1)
      expect(onPick.mock.calls[0]![0]).toMatchObject({ kakaoPlaceId: 'new1' })
    })
  })
  ```
- [ ] Run `npm run test -- src/__tests__/placeSearch.test.tsx` → expected FAIL (PlaceSearch has no `savedKakaoIds`/`onPick`; it saves internally).
  > NOTE: the existing `src/components/places/PlaceSearch.tsx` has a LOCAL `const onPick = (hit) => {...}` (line 13) that saves internally via `useSavePlace` + a local `toast` `useState`. This rewrite REPLACES THE WHOLE FILE — deleting that local `onPick`, the internal `useSavePlace`, the `useState`-based toast, and the `import { useState }`/`useSavePlace` lines. `onPick` is now a delegated PROP, not a local function. Replace the entire file; do NOT splice into the old one (a surgical edit leaves a duplicate `onPick` identifier → TS error).
- [ ] Rewrite `src/components/places/PlaceSearch.tsx` (entire file):
  ```tsx
  import { useKakaoSearch } from '@/hooks/useKakaoSearch'
  import type { KakaoPlaceHit } from '@/lib/kakao/types'
  import styles from './PlaceSearch.module.css'

  // 장소 검색창 + 후보 목록(§5.2). 입력 → 디바운스 자동완성 → 결과 탭하면 onPick(hit)을 부모로 위임.
  // 저장은 더 이상 여기서 즉시 하지 않는다(spec §3.6): 부모(MapPage)가 저장됨이면 선택, 미저장이면 프리뷰.
  export function PlaceSearch({
    coupleId,
    savedKakaoIds,
    onPick,
  }: {
    coupleId: string | null
    savedKakaoIds: Set<string>
    onPick: (hit: KakaoPlaceHit) => void
  }) {
    const { query, setQuery, clear, status, hits, error } = useKakaoSearch()
    void coupleId // coupleId는 부모 저장 흐름에서 사용(여기선 표식만 유지).

    return (
      <div className={styles.wrap} data-testid="place-search">
        <div className={styles.searchRow}>
          <input
            type="search"
            className={styles.input}
            placeholder="가고싶은 곳 검색 (예: 속초 칠성조선소)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="장소 검색"
            enterKeyHint="search"
          />
          {query ? (
            <button className={styles.clearBtn} onClick={clear} aria-label="검색어 지우기">
              ✕
            </button>
          ) : null}
        </div>

        {status === 'loading' ? (
          <p className={styles.hint} role="status">
            검색 중…
          </p>
        ) : null}
        {status === 'error' && error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        {status === 'done' && hits.length === 0 ? (
          <p className={styles.hint}>검색 결과가 없어요. 다른 이름으로 찾아보세요.</p>
        ) : null}

        {hits.length > 0 ? (
          <ul className={styles.results}>
            {hits.map((hit) => {
              const saved = savedKakaoIds.has(hit.kakaoPlaceId)
              return (
                <li key={hit.kakaoPlaceId}>
                  <button
                    className={styles.resultItem}
                    onClick={() => onPick(hit)}
                    aria-label={saved ? `${hit.name} (이미 저장됨) 지도에서 보기` : `${hit.name} 미리보기`}
                  >
                    <span className={styles.name}>{hit.name}</span>
                    <span className={styles.addr}>{hit.address}</span>
                    {hit.category ? <span className={styles.cat}>{hit.category}</span> : null}
                    {saved ? (
                      // 저장됨 표시 — 색만이 아니라 ★ 아이콘 + "저장됨" 텍스트로 이중화(§8).
                      <span className={styles.savedTag}>★ 저장됨</span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    )
  }
  ```
- [ ] Update `src/components/places/PlaceSearch.module.css`: give `.results` a max-height + scroll, and add `.savedTag`. Replace the `.results` rule:
  ```css
  .results {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }
  ```
  with:
  ```css
  /* 결과 패널 — 지도/시트를 가리지 않게 최대 높이 + 내부 스크롤(spec §3.6). */
  .results {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    max-height: 40dvh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* 저장됨 배지 — 색(브랜드)+★+텍스트 이중화(§8). */
  .savedTag {
    align-self: flex-start;
    font-size: 0.75rem;
    color: var(--c-brand);
    font-weight: 600;
  }
  ```
  (The `.toast` rule in this file is now unused since PlaceSearch no longer toasts — leave it; it is harmless and may be reused. To satisfy `noUnusedLocals` there is no TS impact from unused CSS.)
- [ ] Update `src/components/places/MapSearchOverlay.tsx` to thread the new props:
  ```tsx
  import { PlaceSearch } from '@/components/places/PlaceSearch'
  import type { KakaoPlaceHit } from '@/lib/kakao/types'
  import styles from './MapSearchOverlay.module.css'

  // 지도 위 상단 검색 오버레이(spec §5) — PlaceSearch를 시트가 아니라 지도 영역 상단에 고정.
  // savedKakaoIds/onPick을 그대로 PlaceSearch로 전달(저장됨 표시 + 프리뷰/선택 위임, spec §3.6).
  export function MapSearchOverlay({
    coupleId,
    savedKakaoIds,
    onPick,
  }: {
    coupleId: string | null
    savedKakaoIds: Set<string>
    onPick: (hit: KakaoPlaceHit) => void
  }) {
    return (
      <div className={styles.overlay} data-search-overlay="true">
        <PlaceSearch coupleId={coupleId} savedKakaoIds={savedKakaoIds} onPick={onPick} />
      </div>
    )
  }
  ```
- [ ] Update `src/__tests__/mapSearchOverlay.test.tsx`: the mock now forwards the new props and both render calls supply them. Replace the mock:
  ```tsx
  vi.mock('@/components/places/PlaceSearch', () => ({
    PlaceSearch: ({ coupleId }: { coupleId: string | null }) => (
      <input data-testid="place-search-input" aria-label="장소 검색" data-couple={coupleId ?? ''} />
    ),
  }))
  ```
  (unchanged — mock only reads `coupleId`). Then update both `render(<MapSearchOverlay coupleId="c1" />)` calls to:
  ```tsx
  render(<MapSearchOverlay coupleId="c1" savedKakaoIds={new Set<string>()} onPick={() => {}} />)
  ```
  (there are two such calls — update both).
- [ ] Run `npm run test -- src/__tests__/placeSearch.test.tsx src/__tests__/mapSearchOverlay.test.tsx` → expected PASS.
- [ ] `npm run typecheck` → expected PASS.
- [ ] Commit:
  ```
  git add src/components/places/PlaceSearch.tsx src/components/places/PlaceSearch.module.css src/components/places/MapSearchOverlay.tsx src/__tests__/placeSearch.test.tsx src/__tests__/mapSearchOverlay.test.tsx
  git commit -m "$(cat <<'EOF'
  feat(places): 검색 결과 저장됨 표시 + onPick 위임(즉시저장 폐기) + 결과 스크롤

  PlaceSearch가 savedKakaoIds로 ★+"저장됨" 이중화 표시, onPick(hit)으로 부모에 위임(저장 안 함).
  결과 패널 max-height 40dvh + 스크롤. MapSearchOverlay가 props 전달. spec §3.6.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

### Task 17: MapPage preview/select orchestration (savedKakaoIds, previewHit) + save-from-preview test

**Files:**
- Modify: `src/pages/MapPage.tsx` (compute savedKakaoIds, previewHit state, onPick, save handler with offline toast, pass to NaverMap + MapSearchOverlay; render `<Toast>`)
- Create: `src/__tests__/mapPagePreview.test.tsx` (orchestration test — the spec's core new behavior gets explicit coverage, not typecheck-only)

> COVERAGE NOTE (spec §3.6 + §6): the end-to-end search→preview→save orchestration is the core new behavior. Task 16 covers PlaceSearch delegating `onPick`; Task 15 covers the pure `previewWindowHtml`. This task adds the missing MapPage-level test so the orchestration (saved hit→select existing; new hit→preview; preview save→savePlace→clear+select; offline r===null→queue toast) is verified by a test, not typecheck alone.

- [ ] In `src/pages/MapPage.tsx`, add imports for the save hook, types, and toast. Add:
  ```tsx
  import { useSavePlace } from '@/hooks/useSavePlace'
  import { useToast } from '@/hooks/useToast'
  import { Toast } from '@/components/common/Toast'
  import type { KakaoPlaceHit } from '@/lib/kakao/types'
  ```
  (`openDirections` is already imported — do not duplicate. Add only these four lines.)
- [ ] Add `savedKakaoIds`, `previewHit`, save hook, toast. Find:
  ```tsx
    const visitedIds = useMemo(() => new Set((visits ?? []).map((v) => v.place_id)), [visits])
    const [selectedId, setSelectedId] = useState<string | null>(null)
  ```
  Replace with:
  ```tsx
    const visitedIds = useMemo(() => new Set((visits ?? []).map((v) => v.place_id)), [visits])
    const savedKakaoIds = useMemo(
      () => new Set((places ?? []).map((p) => p.kakao_place_id).filter((x): x is string => x != null)),
      [places],
    )
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [previewHit, setPreviewHit] = useState<KakaoPlaceHit | null>(null)
    const savePlace = useSavePlace(coupleId)
    const toast = useToast()
  ```
- [ ] Add the `onPick` (search result → select existing or preview) + a save-from-preview handler + a preview-directions handler. Add after the `onAction` definition:
  ```tsx
    // 검색 결과 탭(spec §3.6): 이미 저장됐으면 기존 마커 선택, 아니면 프리뷰 띄움(즉시 저장 안 함).
    const onPick = (hit: KakaoPlaceHit) => {
      const existing = enriched.find((p) => p.kakao_place_id === hit.kakaoPlaceId)
      if (existing) {
        setPreviewHit(null)
        setSelectedId(existing.id)
      } else {
        setSelectedId(null)
        setPreviewHit(hit)
      }
    }

    // 프리뷰 말풍선 액션(저장/길찾기/닫기). data-id = kakaoPlaceId(프리뷰는 placeId 없음).
    const onPreviewAction = (action: string) => {
      if (!previewHit) return
      if (action === 'close') {
        setPreviewHit(null)
      } else if (action === 'directions') {
        openDirections({ lat: previewHit.lat, lng: previewHit.lng, name: previewHit.name })
      } else if (action === 'save') {
        savePlace.mutate(previewHit, {
          onSuccess: (r) => {
            setPreviewHit(null)
            // 온라인 저장(r): 새 place(또는 이미 담긴 곳) 선택 → 일반 마커로 전환.
            // 오프라인 큐(r===null): 선택 없이 큐 메시지(spec §3.6 "오프라인이면 기존 큐 메시지").
            if (r) setSelectedId(r.placeId)
            else toast.show('오프라인이라 큐에 담았어요 — 연결되면 저장돼요')
          },
          onError: (e) => toast.show(e.message, 3000),
        })
      }
    }
  ```
- [ ] Update the `MapSearchOverlay` usage to pass the new props. Find:
  ```tsx
            {coupleActive ? <MapSearchOverlay coupleId={coupleId} /> : null}
  ```
  Replace with:
  ```tsx
            {coupleActive ? (
              <MapSearchOverlay coupleId={coupleId} savedKakaoIds={savedKakaoIds} onPick={onPick} />
            ) : null}
  ```
- [ ] Update the `NaverMap` usage to pass `previewHit` + `onPreviewAction`. Find:
  ```tsx
            <NaverMap
              places={enriched}
              visitedIds={visitedIds}
              profiles={profiles ?? {}}
              myId={myId}
              reactions={reactions}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onClose={() => setSelectedId(null)}
              onAction={onAction}
            />
  ```
  Replace with:
  ```tsx
            <NaverMap
              places={enriched}
              visitedIds={visitedIds}
              profiles={profiles ?? {}}
              myId={myId}
              reactions={reactions}
              selectedId={selectedId}
              previewHit={previewHit}
              onSelect={(id) => {
                setPreviewHit(null)
                setSelectedId(id)
              }}
              onClose={() => {
                setSelectedId(null)
                setPreviewHit(null)
              }}
              onAction={onAction}
              onPreviewAction={onPreviewAction}
            />
  ```
- [ ] Render `<Toast>` so the offline-queue / error message surfaces. Find the closing of the PlaceSheet + scaffold at the end of the render:
  ```tsx
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
    </ScreenScaffold>
  ```
  Replace with:
  ```tsx
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <Toast msg={toast.msg} />
    </ScreenScaffold>
  ```
- [ ] Write the orchestration test `src/__tests__/mapPagePreview.test.tsx`. It mocks the data hooks (so MapPage renders without Supabase), stubs `NaverMap` with a harness that surfaces `previewHit` and exposes buttons calling `onSelect`/`onPreviewAction`, mocks `useKakaoSearch` to return two hits (one saved, one new), and spies `useSavePlace`. This is the failing test for Task 17's orchestration (it FAILS until Tasks 17+18 are in because MapPage does not yet compute `savedKakaoIds`/`previewHit`/`onPick`):
  ```tsx
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import { render, screen, fireEvent } from '@testing-library/react'
  import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
  import { MemoryRouter } from 'react-router-dom'
  import type { KakaoPlaceHit } from '@/lib/kakao/types'

  // 검색 결과 두 건: saved1(이미 저장됨, place p1과 kakao_place_id 일치), new1(미저장).
  const hits: KakaoPlaceHit[] = [
    { kakaoPlaceId: 'saved1', name: '저장된 카페', address: '속초', lat: 38, lng: 128, category: '카페', placeUrl: '' },
    { kakaoPlaceId: 'new1', name: '새 식당', address: '강릉', lat: 37.7, lng: 128.9, category: '식당', placeUrl: '' },
  ]

  // savePlace.mutate 스파이 — onSuccess(r)를 제어해 온라인 저장/오프라인 큐를 시뮬레이션.
  const saveMutate = vi.fn()

  vi.mock('@/state/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
  vi.mock('@/hooks/useCouple', () => ({
    useCouple: () => ({ data: { coupleId: 'c1', status: 'ACTIVE', userA: 'u1', userB: 'u2' } }),
  }))
  vi.mock('@/hooks/usePlaces', () => ({
    usePlaces: () => ({
      data: [{ id: 'p1', name: '저장된 카페', kakao_place_id: 'saved1', lat: 38, lng: 128, added_by: 'u1' }],
      isLoading: false,
    }),
  }))
  vi.mock('@/hooks/useProfiles', () => ({ useProfiles: () => ({ data: {} }) }))
  vi.mock('@/hooks/useWishes', () => ({ useWishes: () => ({ data: { byPlace: {}, mine: {} } }) }))
  vi.mock('@/hooks/useVisits', () => ({
    useVisits: () => ({ data: [] }),
    useMarkVisited: () => ({ mutate: vi.fn(), isPending: false }),
    useUnmarkVisited: () => ({ mutate: vi.fn(), isPending: false }),
  }))
  vi.mock('@/hooks/useReactions', () => ({
    useReactions: () => ({ data: {} }),
    useToggleReaction: () => ({ mutate: vi.fn() }),
  }))
  vi.mock('@/hooks/useRealtimePlaces', () => ({ useRealtimePlaces: () => {} }))
  vi.mock('@/hooks/useSavePlace', () => ({ useSavePlace: () => ({ mutate: saveMutate }) }))
  vi.mock('@/lib/naver/loadNaverMaps', () => ({ isNaverMapConfigured: () => true }))
  vi.mock('@/hooks/useKakaoSearch', () => ({
    useKakaoSearch: () => ({ query: '카', setQuery: () => {}, clear: () => {}, status: 'done', hits, error: null }),
  }))
  // PlaceSheet은 무거우니 가벼운 스텁(이 테스트는 검색→프리뷰→저장 흐름만 검증).
  vi.mock('@/components/places/PlaceSheet', () => ({ PlaceSheet: () => <div data-testid="sheet" /> }))
  // NaverMap 스텁 — previewHit/selectedId를 노출하고 onSelect/onPreviewAction을 버튼으로 트리거.
  vi.mock('@/components/map/NaverMap', () => ({
    NaverMap: (props: {
      previewHit: KakaoPlaceHit | null
      selectedId: string | null
      onSelect: (id: string) => void
      onPreviewAction: (action: string) => void
    }) => (
      <div>
        <div data-testid="preview">{props.previewHit?.kakaoPlaceId ?? 'none'}</div>
        <div data-testid="selected">{props.selectedId ?? 'none'}</div>
        <button onClick={() => props.onPreviewAction('save')}>preview-save</button>
      </div>
    ),
  }))

  import MapPage from '@/pages/MapPage'

  function renderMap() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <MapPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  describe('MapPage 검색→프리뷰→저장 오케스트레이션(spec §3.6)', () => {
    beforeEach(() => saveMutate.mockReset())

    it('이미 저장된 결과를 탭하면 기존 place를 선택(previewHit 없음, selectedId=p1)', () => {
      renderMap()
      fireEvent.click(screen.getByText('저장된 카페'))
      expect(screen.getByTestId('preview')).toHaveTextContent('none')
      expect(screen.getByTestId('selected')).toHaveTextContent('p1')
    })

    it('미저장 결과를 탭하면 previewHit 설정(selectedId 없음)', () => {
      renderMap()
      fireEvent.click(screen.getByText('새 식당'))
      expect(screen.getByTestId('preview')).toHaveTextContent('new1')
      expect(screen.getByTestId('selected')).toHaveTextContent('none')
    })

    it('프리뷰 저장 성공(r) 시 savePlace 호출 + previewHit 해제 + 새 place 선택', () => {
      saveMutate.mockImplementation((_hit, opts) => opts.onSuccess({ placeId: 'p2', jumped: false }))
      renderMap()
      fireEvent.click(screen.getByText('새 식당'))
      fireEvent.click(screen.getByText('preview-save'))
      expect(saveMutate).toHaveBeenCalledTimes(1)
      expect(saveMutate.mock.calls[0]![0]).toMatchObject({ kakaoPlaceId: 'new1' })
      expect(screen.getByTestId('preview')).toHaveTextContent('none')
      expect(screen.getByTestId('selected')).toHaveTextContent('p2')
    })

    it('오프라인(r===null)이면 선택 없이 큐 토스트를 보여준다(spec §3.6)', () => {
      saveMutate.mockImplementation((_hit, opts) => opts.onSuccess(null))
      renderMap()
      fireEvent.click(screen.getByText('새 식당'))
      fireEvent.click(screen.getByText('preview-save'))
      expect(screen.getByTestId('selected')).toHaveTextContent('none')
      expect(screen.getByText(/오프라인이라 큐에 담았어요/)).toBeInTheDocument()
    })
  })
  ```
- [ ] Run `npm run test -- src/__tests__/mapPagePreview.test.tsx` → expected FAIL (MapPage does not yet compute `savedKakaoIds`/`previewHit`/`onPick`/`onPreviewAction`; `onPick` is not passed to PlaceSearch via the overlay until Task 16, and NaverMap props until Task 18). This stays red until the typecheck below passes (Tasks 16+17+18 wired); it turns green in the combined Task 17+18 verification step.
- [ ] `npm run typecheck` → expected FAIL (NaverMap does not yet accept `previewHit`/`onPreviewAction`). This is expected; Task 18 adds them. **Sequencing note:** Tasks 17 and 18 must land together (MapPage references NaverMap's new props; they only typecheck together). Implement Task 18 immediately, then run typecheck/tests (including `mapPagePreview.test.tsx`), then make ONE commit covering both. (Marked below.)
- [ ] (Deferred commit — combine with Task 18.)

### Task 18: NaverMap preview marker + InfoWindow driven by previewHit

**Files:**
- Modify: `src/components/map/NaverMap.tsx` (new props, preview marker ref + effect, InfoWindow precedence, teardown)
- Modify: `src/components/map/NaverMap.module.css` (add `.pinPreview`)

- [ ] Add the new props to `NaverMap`. Find the props destructure + type:
  ```tsx
  export function NaverMap({
    places,
    visitedIds,
    profiles,
    myId,
    reactions,
    selectedId,
    onSelect,
    onClose,
    onAction,
  }: {
    places: MarkerPlace[]
    visitedIds?: Set<string>
    profiles?: ProfileMap
    myId?: string | null
    reactions?: ReactionMap
    selectedId?: string | null
    onSelect?: (id: string) => void
    onClose?: () => void
    onAction?: (action: string, id: string) => void
  }) {
  ```
  Replace with:
  ```tsx
  export function NaverMap({
    places,
    visitedIds,
    profiles,
    myId,
    reactions,
    selectedId,
    previewHit,
    onSelect,
    onClose,
    onAction,
    onPreviewAction,
  }: {
    places: MarkerPlace[]
    visitedIds?: Set<string>
    profiles?: ProfileMap
    myId?: string | null
    reactions?: ReactionMap
    selectedId?: string | null
    previewHit?: KakaoPlaceHit | null
    onSelect?: (id: string) => void
    onClose?: () => void
    onAction?: (action: string, id: string) => void
    onPreviewAction?: (action: string) => void
  }) {
  ```
- [ ] Add imports for the preview type + builder:
  ```tsx
  import { infoWindowHtml, previewWindowHtml } from '@/lib/places/infoWindowHtml'
  import type { KakaoPlaceHit } from '@/lib/kakao/types'
  ```
  (replace the existing `import { infoWindowHtml } from '@/lib/places/infoWindowHtml'` with the first; add the type import.)
- [ ] Add a preview marker ref + a DEDICATED preview InfoWindow + its own handler ref + an `onPreviewAction` ref. The preview must NOT share `infoRef`/`infoHandlerRef` with the saved-selection effect: that effect re-fires on MANY deps (selectedId, places, visitedIds, reactions, profiles, myId) and a realtime places/reactions invalidation while a preview is open would otherwise tear down the preview's window + click handler. Two separate InfoWindow + handler refs make the two effects own disjoint objects (research 02 §3(3) — "use a separate InfoWindow instance to avoid the two effects fighting over infoRef"). Find:
  ```tsx
    const mapClickRef = useRef<naver.maps.MapEventListener | null>(null)
  ```
  Replace with:
  ```tsx
    const mapClickRef = useRef<naver.maps.MapEventListener | null>(null)
    const previewMarkerRef = useRef<naver.maps.Marker | null>(null)
    // 프리뷰 전용 InfoWindow + 핸들러 — saved용 infoRef/infoHandlerRef와 분리(공유 소유권 경합 방지).
    const previewInfoRef = useRef<naver.maps.InfoWindow | null>(null)
    const previewHandlerRef = useRef<((e: MouseEvent) => void) | null>(null)
  ```
  And near the other callback refs, find:
  ```tsx
    const onActionRef = useRef(onAction)
    onActionRef.current = onAction
  ```
  Replace with:
  ```tsx
    const onActionRef = useRef(onAction)
    onActionRef.current = onAction
    const onPreviewActionRef = useRef(onPreviewAction)
    onPreviewActionRef.current = onPreviewAction
  ```
- [ ] Create the dedicated preview InfoWindow in the init effect, right after the single saved InfoWindow is created. Find:
  ```tsx
        // 단일 InfoWindow 1회 생성(말풍선 재사용).
        infoRef.current = new nv.maps.InfoWindow({
  ```
  …and after that `new nv.maps.InfoWindow({ ... })` statement closes (the saved one), add the preview window. Locate the end of that constructor call (`})` that closes the `infoRef.current = new nv.maps.InfoWindow({...})`) and insert immediately after it:
  ```tsx
        // 프리뷰 전용 InfoWindow(saved와 분리) — 동일 옵션(테두리 없음/배경 투명, CSS가 말풍선 그림).
        previewInfoRef.current = new nv.maps.InfoWindow({
          content: '',
          borderWidth: 0,
          backgroundColor: 'transparent',
          disableAnchor: true,
          pixelOffset: new nv.maps.Point(0, -8),
        })
  ```
  > NOTE: copy the EXACT option object the existing saved `infoRef` uses (borderWidth/backgroundColor/disableAnchor/pixelOffset) so the preview bubble looks identical — if the repo's saved InfoWindow uses different options, mirror those instead. The point is a SECOND independent instance, not shared `infoRef`.
- [ ] In the init effect teardown, also tear down the preview marker AND the preview InfoWindow + handler. Find:
  ```tsx
        markersRef.current.forEach((m) => m.setMap(null))
        markersRef.current = []
        markerMapRef.current.clear()
        mapRef.current = null
  ```
  Replace with:
  ```tsx
        markersRef.current.forEach((m) => m.setMap(null))
        markersRef.current = []
        markerMapRef.current.clear()
        previewMarkerRef.current?.setMap(null)
        previewMarkerRef.current = null
        if (previewHandlerRef.current && previewInfoRef.current) {
          previewInfoRef.current.getContentElement()?.removeEventListener('click', previewHandlerRef.current)
        }
        previewHandlerRef.current = null
        previewInfoRef.current?.close()
        previewInfoRef.current = null
        mapRef.current = null
  ```
- [ ] Guard the saved-selection InfoWindow effect so it does NOT touch ANYTHING while a preview is open — it must only ever close its OWN `info` (never the preview's window/handler). Find the start of that effect:
  ```tsx
      if (!selectedId) {
        info.close()
        return
      }
  ```
  Replace with:
  ```tsx
      // 프리뷰가 떠 있으면 saved 말풍선은 자기 것만 닫고 즉시 종료(preview 우선, spec §3.6 — 동시 표시 안 함).
      // 프리뷰 effect의 previewInfoRef/previewHandlerRef는 절대 건드리지 않는다(소유권 분리 → realtime
      // places/reactions 무효화로 이 effect가 재실행돼도 열려 있는 프리뷰 말풍선을 부수지 않음, research 02 §3(3)).
      if (previewHit || !selectedId) {
        info.close()
        return
      }
  ```
  And add `previewHit` to that effect's deps so it closes the saved window the moment a preview opens. Find:
  ```tsx
    }, [selectedId, places, ready, visitedIds, reactions, profiles, myId])
  ```
  Replace with:
  ```tsx
    }, [selectedId, places, ready, visitedIds, reactions, profiles, myId, previewHit])
  ```
- [ ] Add the preview effect right AFTER the saved-selection InfoWindow effect (before the ESC effect). It owns ONLY `previewMarkerRef` + `previewInfoRef` + `previewHandlerRef` — never `infoRef`/`infoHandlerRef`. Its deps are `[previewHit, ready]` only, so saved-effect re-runs (realtime invalidations) cannot tear it down:
  ```tsx
    // 프리뷰(미저장 검색 후보) — 전용 transient 마커 + 전용 InfoWindow(previewInfoRef)를 구동(saved와 배타).
    // saved용 infoRef/infoHandlerRef는 절대 만지지 않는다(소유권 분리, research 02 §3(3)).
    useEffect(() => {
      const nv = window.naver
      const map = mapRef.current
      const info = previewInfoRef.current
      if (!ready || !nv || !map || !info) return

      // 이전 프리뷰 위임 리스너 제거(중복 바인딩 방지) — 프리뷰 핸들러 ref만 사용.
      const prevEl = info.getContentElement()
      if (prevEl && previewHandlerRef.current) prevEl.removeEventListener('click', previewHandlerRef.current)
      previewHandlerRef.current = null

      if (!previewHit) {
        info.close()
        previewMarkerRef.current?.setMap(null)
        previewMarkerRef.current = null
        return
      }

      const pos = new nv.maps.LatLng(previewHit.lat, previewHit.lng)
      // 프리뷰 마커는 1개만 — 위치만 갱신(클러스터 대상 아님, transient).
      if (previewMarkerRef.current) {
        previewMarkerRef.current.setPosition(pos)
      } else {
        previewMarkerRef.current = new nv.maps.Marker({
          position: pos,
          map,
          zIndex: SELECTED_ZINDEX + 1,
          icon: {
            content: `<div class="${styles.pin} ${styles.pinPreview}" aria-label="${escapeHtml(previewHit.name)} 미리보기">＋</div>`,
            anchor: new nv.maps.Point(12, 24),
          },
        })
      }
      map.panTo(pos)

      info.setContent(previewWindowHtml(previewHit))
      info.open(map, previewMarkerRef.current)

      const el = info.getContentElement()
      if (el) {
        const handler = (e: MouseEvent) => {
          const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null
          if (!btn) return
          onPreviewActionRef.current?.(btn.dataset.action ?? '')
        }
        el.addEventListener('click', handler)
        previewHandlerRef.current = handler
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [previewHit, ready])
  ```
  (`escapeHtml` is exported from `infoWindowHtml`; add it to the import: change `import { infoWindowHtml, previewWindowHtml }` to `import { infoWindowHtml, previewWindowHtml, escapeHtml }`.)
  > PRECEDENCE/RACE REASONING (verify, no test possible for live SDK): the preview owns `previewInfoRef`/`previewHandlerRef`/`previewMarkerRef`; the saved effect owns `infoRef`/`infoHandlerRef`/per-place markers. They share NO mutable object. When `previewHit` is set: (1) the saved effect re-fires (previewHit is in its deps) and closes only `info` (its own); (2) the preview effect opens `previewInfoRef`. A subsequent realtime places/reactions invalidation re-runs the saved effect with `previewHit` still truthy → it hits the early `info.close()` return and touches nothing of the preview → the preview bubble + its Save/길찾기 buttons stay alive. Clearing `previewHit` (onClose/onSelect/save success) re-runs the preview effect which closes `previewInfoRef` and removes the preview marker; the saved effect then re-runs to show the selected place if any.
- [ ] Add the preview pin style to `src/components/map/NaverMap.module.css`:
  ```css
  /* 프리뷰(미저장 검색 후보) 핀 — ＋ 글리프 + 점선 링으로 저장 핀(★/♥)과 모양 구분(§8). */
  .pinPreview {
    color: var(--c-cta-bg);
    font-weight: 700;
    border: 2px dashed var(--c-cta-bg);
    border-radius: 50%;
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--c-surface);
  }
  ```
- [ ] `npm run typecheck` → expected PASS (Task 17 + 18 together resolve all prop references).
- [ ] `npm run test -- src/__tests__/previewWindowHtml.test.ts src/__tests__/infoWindowHtml.test.ts src/__tests__/markerVisual.test.ts` → expected PASS.
- [ ] `npm run test -- src/__tests__/mapPagePreview.test.tsx` → expected PASS (the Task 17 orchestration test now goes green: saved→select, new→preview, preview save→savePlace+clear+select, offline→queue toast).
- [ ] `npm run test -- src/__tests__/routing.test.tsx` → expected PASS (MapPage renders; map config gated by `isNaverMapConfigured()`).
- [ ] Commit (covers BOTH Task 17 and Task 18, including the orchestration test):
  ```
  git add src/pages/MapPage.tsx src/components/map/NaverMap.tsx src/components/map/NaverMap.module.css src/__tests__/mapPagePreview.test.tsx
  git commit -m "$(cat <<'EOF'
  feat(map): 검색 프리뷰/선택 오케스트레이션 + 프리뷰 마커·말풍선

  MapPage: savedKakaoIds 도출, previewHit 상태, onPick(저장됨→선택/미저장→프리뷰),
  프리뷰 [저장]→useSavePlace→성공 시 새 place 선택(오프라인 r===null이면 큐 토스트, onError 표시).
  NaverMap: transient 프리뷰 마커(＋ 점선) + 전용 InfoWindow(previewInfoRef, saved infoRef와 분리해
  realtime 무효화 중 프리뷰 말풍선 파괴 방지). mapPagePreview 테스트로 오케스트레이션 검증. spec §3.6.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Phase P7: 클러스터링

### Task 19: `clusterPlaces` pure grid clusterer + unit test

**Files:**
- Create: `src/lib/places/clusterPlaces.ts`
- Create: `src/__tests__/clusterPlaces.test.ts`

Deviation (record in file header): web-stack §5 suggests the "네이버 MarkerClustering 샘플". We use a pure lat/lng-grid clusterer because the sample ships no TS types (would force `any`/`@ts-ignore`, violating strict rules) and a pure function is unit-testable (research 02 §3(2)).

- [ ] Write a failing test `src/__tests__/clusterPlaces.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest'
  import { clusterPlaces, type ClusterPoint } from '@/lib/places/clusterPlaces'

  const A: ClusterPoint = { id: 'a', lat: 37.5000, lng: 127.0000 }
  const B: ClusterPoint = { id: 'b', lat: 37.5001, lng: 127.0001 } // A와 ~14m(낮은/중간 줌에선 같은 셀)
  const FAR: ClusterPoint = { id: 'c', lat: 38.5, lng: 128.5 }

  describe('clusterPlaces (순수 그리드 클러스터러)', () => {
    it('빈 입력은 빈 배열', () => {
      expect(clusterPlaces([], 12)).toEqual([])
    })

    it('낮은 줌(셀 큼)에서 가까운 두 점은 한 클러스터로 묶이고 count=2', () => {
      const out = clusterPlaces([A, B], 6)
      const clusters = out.filter((c) => c.kind === 'cluster')
      expect(clusters).toHaveLength(1)
      expect(clusters[0]!.count).toBe(2)
      expect(new Set(clusters[0]!.ids)).toEqual(new Set(['a', 'b']))
    })

    it('멀리 떨어진 점은 단일(single)로 남는다', () => {
      const out = clusterPlaces([A, FAR], 6)
      const singles = out.filter((c) => c.kind === 'single')
      expect(singles).toHaveLength(2)
    })

    it('아주 높은 줌(셀 매우 작음)에서는 가까운 두 점도 각각 단일', () => {
      // zoom 20: cellSizeDeg = 1.0/2^(20-6) ≈ 6.10e-5° (~6.8m) < A·B 분리(~14m) → 서로 다른 셀.
      // (주의: zoom 18은 cell ~27m로 A·B가 같은 셀에 묶이므로 단일 분리를 검증하지 못한다.)
      const out = clusterPlaces([A, B], 20)
      expect(out.every((c) => c.kind === 'single')).toBe(true)
      expect(out).toHaveLength(2)
    })

    it('클러스터 좌표는 멤버 평균(centroid)', () => {
      const out = clusterPlaces([A, B], 6)
      const cl = out.find((c) => c.kind === 'cluster')!
      expect(cl.lat).toBeCloseTo((A.lat + B.lat) / 2, 6)
      expect(cl.lng).toBeCloseTo((A.lng + B.lng) / 2, 6)
    })
  })
  ```
- [ ] Run `npm run test -- src/__tests__/clusterPlaces.test.ts` → expected FAIL (module does not exist).
- [ ] Create `src/lib/places/clusterPlaces.ts`:
  ```ts
  // 마커 클러스터링(spec §3.7) — 순수 그리드 클러스터러.
  // 편차(web-stack §5 "네이버 MarkerClustering 샘플"): 샘플은 TS 타입이 없어 strict/any 금지에 위배되고
  // 명령형 오버레이라 테스트가 어렵다. 동일한 시각 결과(개수 배지 클러스터)를 순수 함수로 구현(research 02 §3).
  // 줌이 높을수록 셀이 작아져 분해능↑(가까운 점도 개별). 좌표는 멤버 centroid. naver/DOM 비의존.

  export type ClusterPoint = { id: string; lat: number; lng: number }

  export type ClusterOrSingle =
    | { kind: 'single'; id: string; lat: number; lng: number }
    | { kind: 'cluster'; lat: number; lng: number; count: number; ids: string[] }

  // 줌별 그리드 셀 크기(도, degrees). 줌이 커질수록 셀이 절반씩 작아진다(단조 감소면 충분, 정밀 지리 아님).
  // zoom<=6: ~1.0°(~111km), zoom 12: ~1.56e-2°(~1.7km), zoom 18: ~2.44e-4°(~27m),
  // zoom 20: ~6.10e-5°(~6.8m). 가까운 두 점(~14m)은 zoom 18까진 같은 셀, zoom 20에서 분리된다.
  function cellSizeDeg(zoom: number): number {
    // base 1.0° at zoom 6, 줌 1 증가마다 절반.
    const exp = Math.max(0, zoom - 6)
    return 1.0 / Math.pow(2, exp)
  }

  export function clusterPlaces(points: ClusterPoint[], zoom: number): ClusterOrSingle[] {
    if (points.length === 0) return []
    const size = cellSizeDeg(zoom)
    const buckets = new Map<string, ClusterPoint[]>()
    for (const p of points) {
      const gx = Math.floor(p.lng / size)
      const gy = Math.floor(p.lat / size)
      const key = `${gx}:${gy}`
      const arr = buckets.get(key)
      if (arr) arr.push(p)
      else buckets.set(key, [p])
    }
    const out: ClusterOrSingle[] = []
    for (const arr of buckets.values()) {
      if (arr.length === 1) {
        const p = arr[0]!
        out.push({ kind: 'single', id: p.id, lat: p.lat, lng: p.lng })
      } else {
        const count = arr.length
        const lat = arr.reduce((s, p) => s + p.lat, 0) / count
        const lng = arr.reduce((s, p) => s + p.lng, 0) / count
        out.push({ kind: 'cluster', lat, lng, count, ids: arr.map((p) => p.id) })
      }
    }
    return out
  }
  ```
- [ ] Run `npm run test -- src/__tests__/clusterPlaces.test.ts` → expected PASS.
- [ ] `npm run typecheck` → expected PASS.
- [ ] Commit:
  ```
  git add src/lib/places/clusterPlaces.ts src/__tests__/clusterPlaces.test.ts
  git commit -m "$(cat <<'EOF'
  feat(map): clusterPlaces — 순수 그리드 클러스터러(줌별 셀, centroid)

  편차: 네이버 MarkerClustering 샘플 대신 순수 함수(타입·테스트 가능, web-stack §5). spec §3.7.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

### Task 20: NaverMap renders clusters vs individual markers (recompute on idle/zoom)

**Files:**
- Modify: `src/components/map/NaverMap.tsx` (marker-rebuild effect → cluster-aware render; add idle/zoom listeners + cluster-click zoom)
- Modify: `src/components/map/NaverMap.module.css` (add `.cluster`)

Design: the marker-rebuild effect currently builds one marker per place and stores them in `markerMapRef` keyed by place id (the highlight + InfoWindow effects depend on that map). To keep those effects working, clustering renders **individual markers for singles into `markerMapRef`** (unchanged behavior) and **cluster markers into a separate `clusterMarkersRef`** (not in `markerMapRef`). Recompute runs the same builder on `idle`/`zoom_changed`. No `fitBounds` on recompute (map-jump avoidance, research 02 §4).

- [ ] Add imports + refs. Add import:
  ```tsx
  import { clusterPlaces, type ClusterPoint } from '@/lib/places/clusterPlaces'
  ```
  Add refs near `markerMapRef`. Find:
  ```tsx
    const markerMapRef = useRef<Map<string, naver.maps.Marker>>(new Map())
    const listenersRef = useRef<naver.maps.MapEventListener[]>([])
  ```
  Replace with:
  ```tsx
    const markerMapRef = useRef<Map<string, naver.maps.Marker>>(new Map())
    const clusterMarkersRef = useRef<naver.maps.Marker[]>([])
    const listenersRef = useRef<naver.maps.MapEventListener[]>([])
    const mapMoveRef = useRef<naver.maps.MapEventListener[]>([])
  ```
- [ ] Refactor the marker-rebuild effect into a recomputing renderer. Replace the entire effect body (the one with deps `[places, ready, onSelect]`). Find from:
  ```tsx
    // 장소 변경 시 마커 다시 그림
    useEffect(() => {
      const nv = window.naver
      const map = mapRef.current
      if (!ready || !nv || !map) return

      // 이전 마커/리스너 정리(리스너 누락 금지).
      nv.maps.Event.removeListener(listenersRef.current)
      listenersRef.current = []
      markersRef.current.forEach((m) => m.setMap(null))
      markersRef.current = []
      markerMapRef.current.clear()

      const pts = places.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number')
      if (pts.length === 0) return
  ```
  through the end of that effect (the `}, [places, ready, onSelect])` line). Replace the WHOLE effect with:
  ```tsx
    // 장소/줌 변경 시 마커를 클러스터 인지 방식으로 다시 그림(spec §3.7).
    // 단일(single)은 기존처럼 markerMapRef에 등록(highlight/InfoWindow 효과가 이를 사용).
    // 클러스터는 별도 clusterMarkersRef에 — 클릭 시 줌인(개별 강조/onSelect는 단일 마커에서만).
    useEffect(() => {
      const nv = window.naver
      const map = mapRef.current
      if (!ready || !nv || !map) return

      const render = () => {
        const m = mapRef.current
        if (!nv || !m) return
        // 이전 마커/리스너 정리(리스너 누락 금지).
        nv.maps.Event.removeListener(listenersRef.current)
        listenersRef.current = []
        markersRef.current.forEach((mk) => mk.setMap(null))
        markersRef.current = []
        markerMapRef.current.clear()
        clusterMarkersRef.current.forEach((mk) => mk.setMap(null))
        clusterMarkersRef.current = []

        const pts: ClusterPoint[] = places
          .filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number')
          .map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng! }))
        if (pts.length === 0) return

        const groups = clusterPlaces(pts, m.getZoom())
        for (const g of groups) {
          if (g.kind === 'single') {
            const p = places.find((pl) => pl.id === g.id)
            if (!p) continue
            const visual = markerVisual({
              visited: visitedIds?.has(p.id) ?? false,
              bothWished: p.wish?.bothWished ?? false,
              name: p.name,
            })
            const modifier =
              visual.kind === 'visited'
                ? styles.pinVisited
                : visual.kind === 'both'
                  ? styles.pinBoth
                  : ''
            const pinClass = `${styles.pin} ${modifier}`.trim()
            const marker = new nv.maps.Marker({
              position: new nv.maps.LatLng(g.lat, g.lng),
              map: m,
              title: visual.label,
              zIndex: BASE_ZINDEX,
              icon: {
                content: markerIconHtml({
                  glyph: visual.glyph,
                  pinClass,
                  label: visual.label,
                  selected: p.id === selectedId,
                }),
                anchor: new nv.maps.Point(12, 24),
              },
            })
            const handle = nv.maps.Event.addListener(marker, 'click', () => onSelect?.(p.id))
            listenersRef.current.push(handle)
            markersRef.current.push(marker)
            markerMapRef.current.set(p.id, marker)
          } else {
            // 클러스터 마커 — 색+개수 텍스트 이중화(§8). 클릭 시 그 위치로 줌인.
            const label = `장소 ${g.count}곳 묶음`
            const cluster = new nv.maps.Marker({
              position: new nv.maps.LatLng(g.lat, g.lng),
              map: m,
              title: label,
              zIndex: BASE_ZINDEX,
              icon: {
                content: `<div class="${styles.cluster}" aria-label="${escapeHtml(label)}">${g.count}</div>`,
                anchor: new nv.maps.Point(18, 18),
              },
            })
            const pos = new nv.maps.LatLng(g.lat, g.lng)
            const handle = nv.maps.Event.addListener(cluster, 'click', () => {
              m.setCenter(pos)
              m.setZoom(Math.min(m.getZoom() + 3, 19))
            })
            listenersRef.current.push(handle)
            clusterMarkersRef.current.push(cluster)
          }
        }
      }

      render()
      // 줌/이동 정착 시 재계산(과도한 fitBounds 금지 — 센터/줌만 사용자가 바꿈, research 02 §4).
      mapMoveRef.current = [
        nv.maps.Event.addListener(map, 'idle', render),
        nv.maps.Event.addListener(map, 'zoom_changed', render),
      ]
      return () => {
        nv.maps.Event.removeListener(mapMoveRef.current)
        mapMoveRef.current = []
      }
      // selectedId/visitedIds는 강조 효과가 setIcon으로 갱신하므로 deps 제외(지도 튐/재구독 방지).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [places, ready, onSelect])
  ```
- [ ] Update the init-effect teardown to also clear cluster markers + move listeners. Find:
  ```tsx
        markersRef.current.forEach((m) => m.setMap(null))
        markersRef.current = []
        markerMapRef.current.clear()
        previewMarkerRef.current?.setMap(null)
  ```
  Replace with:
  ```tsx
        markersRef.current.forEach((m) => m.setMap(null))
        markersRef.current = []
        markerMapRef.current.clear()
        clusterMarkersRef.current.forEach((m) => m.setMap(null))
        clusterMarkersRef.current = []
        window.naver?.maps.Event.removeListener(mapMoveRef.current)
        mapMoveRef.current = []
        previewMarkerRef.current?.setMap(null)
  ```
- [ ] Add the cluster style to `src/components/map/NaverMap.module.css`:
  ```css
  /* 클러스터 마커 — 색(브랜드)+개수 텍스트 이중화(§8). 원형 배지. */
  .cluster {
    min-width: 36px;
    height: 36px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--c-brand);
    color: #fff;
    font-weight: 700;
    font-size: 0.875rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
    transform: translate(-50%, -50%);
    cursor: pointer;
  }
  ```
- [ ] `npm run typecheck` → expected PASS.
- [ ] `npm run test -- src/__tests__/clusterPlaces.test.ts src/__tests__/markerVisual.test.ts src/__tests__/selectedMarker.test.ts` → expected PASS (pure helpers intact).
- [ ] `npm run test` → expected PASS (full suite regression).
- [ ] `npm run build` → expected PASS.
- [ ] Commit:
  ```
  git add src/components/map/NaverMap.tsx src/components/map/NaverMap.module.css
  git commit -m "$(cat <<'EOF'
  feat(map): 저장 마커 클러스터링(idle/zoom 재계산, 클러스터 클릭 줌인)

  clusterPlaces로 단일/클러스터 구분 렌더 — 단일은 markerMapRef(강조/말풍선 유지), 클러스터는
  별도 ref(클릭 시 줌인). 색+개수 텍스트 이중화(§8). 프리뷰 마커는 클러스터 제외(transient). spec §3.7.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Final verification (after all tasks)

### Task 21: Full gate sweep + map visual verification (vitest mount + manual)

**Files:** none (verification only)

> GATE DEVIATION (recorded in spec §6 + §7): spec §6 originally asked for a Playwright smoke capturing the full-bleed map + sheet peek/full + search overlay empty state in light/dark. That gate is **uncoverable as planned**: `e2e/smoke.spec.ts` runs a key-less build that is never logged in, so `/` redirects to `/auth` and the authenticated map route is unreachable (the spec's own comment scopes authenticated screens out of e2e; there is no auth/couple seed harness, and building one is out of scope for this overhaul). Decision: **downgrade the Playwright requirement to "auth screen only; authenticated map smoke deferred (follow-up)"**, keep `npm run e2e` green UNCHANGED (no map captures), and move the full-bleed / '내 위치' / sheet / search-overlay verification to (a) the vitest MapPage mount (`mapPagePreview.test.tsx`, which mounts MapPage with mocked auth/couple) and (b) the manual spot-check below. This is recorded as a deviation in spec §7 (후속).

- [ ] `npm run typecheck` → expected PASS (0 errors).
- [ ] `npm run test` → expected PASS (all vitest suites including new: screenScaffold, unmarkVisited, currentPosition, previewWindowHtml, placeSearch, clusterPlaces, usPageTrash, mapPagePreview; updated: routing, placeList, placeSheet, infoWindowHtml, mapSearchOverlay).
- [ ] `npm run build` → expected PASS (tsc + Vite production build).
- [ ] `npm run e2e` → expected PASS, **UNCHANGED**. Do NOT attempt to capture the map in e2e — the key-less e2e build redirects `/` (and all protected routes) to `/auth`, so the authenticated map screen is unreachable and there is nothing in `e2e/` referencing TodayCard/title/trips/trash to update (`e2e/smoke.spec.ts` only asserts the `/auth` login screen). The existing auth-screen specs must simply remain green. No e2e edits, no e2e commit.
- [ ] Confirm the authenticated map UI is exercised by vitest instead of e2e: `npm run test -- src/__tests__/mapPagePreview.test.tsx src/__tests__/routing.test.tsx` → expected PASS. `mapPagePreview` mounts the real MapPage (mocked auth/couple, `isNaverMapConfigured()=true`) and verifies the full-bleed render path + search overlay + preview/select/save orchestration; `routing` verifies the full-bleed `region` (no `<h1>`) and `page-map` testId.
- [ ] Manual accessibility + layout spot-check (no commit; run `npm run dev` with real Naver key + an ACTIVE couple, mobile viewport WITH iOS-style safe-area inset). Confirm — and record results in the PR description:
  - Full-bleed map fills the viewport minus the tab bar (not 0/short height — research 01 §8); Naver logo + scale render visibly between the map bottom and the peek sheet top (research 01 §10).
  - Geolocation fallback chain (spec §2/§3.5): allow location → map centers on me (zoom 14); deny location with saved places → map fits saved-place bounds; deny location with NO saved places → map stays on Seoul.
  - Color+shape dual-coding (§8): cluster badge (count text), saved indicator (★ + "저장됨"), preview pin (＋ dashed), visit toggle ("가봤음 (취소)" text).
  - `prefers-reduced-motion` respected (panTo/setZoom use no decorative animation); safe-area on '내 위치' button + sheet + tab bar.
  - Open a preview bubble, then trigger a realtime places/reactions update (e.g. partner adds a place) — the preview bubble + its 저장/길찾기 buttons stay alive (Task 18 dedicated `previewInfoRef` precedence; research 02 §3(3)).

---

## Notes / assumptions for the executor

- **Task 17 + Task 18 are a single commit** (MapPage references NaverMap's new props; they only typecheck together). Implement 17, then 18, run gates, commit once. All other tasks are independently committable.
- **`visits` prop on PlaceSheet is intentionally kept** (Task 11) because `useUnmarkVisited` needs the active visit rows; only TripsSection/TrashSection are removed. The placeSheet test keeps `visits: []` in props.
- **`ConflictBanner` prop shape is `{ message?, onDismiss }`** in this repo (verified) — usage `<ConflictBanner onDismiss={...} />` is correct.
- **Routing test heading change**: the full-bleed map has no `<h1>`; the routing test now asserts a `region` landmark named "지도" for `/` (Task 3). All other tabs keep `<h1>` headings.
- **Tokens**: reuse `--safe-bottom`/`--safe-top` (already exist); only `--sheet-peek-h` + `--tabbar-h` are new (Task 1). Do not introduce new safe-area tokens.
- **`--sheet-peek-h` (18dvh) is the single source** for the peek band, mirroring sheetSnap ratio 0.18 (research 01 §10). The map bottom inset, the '내 위치' button, and the locToast all use `--sheet-peek-h` ALONE (no `+ --safe-bottom`) — the peek sheet sits at viewport `bottom:0` and absorbs the bottom safe-area itself, so adding `--safe-bottom` would double-count and push controls into a gap above the real peek top.
- **Full-bleed height**: `.content` (AppLayout) becomes a definite-height flex column (Task 3) so the full-bleed scaffold + `.mapWrap` size via `flex:1; min-height:0` rather than fragile percentage height (research 01 §8). Verify in a real browser that the map fills the viewport minus the tab bar.
- **`--tabbar-h`** is added for future de-duplication of the 72px constant; this plan introduces it but only `--sheet-peek-h` is strictly consumed (by map inset + floating button). Existing 72px literals are left untouched to keep diffs surgical (YAGNI for this overhaul).
- **Save-from-preview offline feedback** (Task 17): `useSavePlace` returns `SaveResult | null` where `SaveResult = { placeId: string; jumped: boolean }`. On success `r` (online), `setSelectedId(r.placeId)` regardless of `jumped` (no `jumped` branching — it's the same action). On `r === null` (offline-queued), show the exact existing queue toast `'오프라인이라 큐에 담았어요 — 연결되면 저장돼요'` and select nothing (query invalidation reflects it). MapPage gains its own `useToast()` + `<Toast>` for this.
- **Preview InfoWindow ownership** (Task 18): the preview uses a DEDICATED `previewInfoRef` + `previewHandlerRef` + `previewMarkerRef`, separate from the saved-selection `infoRef`/`infoHandlerRef`. They share no mutable object, so a realtime places/reactions invalidation (which re-runs the saved effect on its many deps) cannot tear down an open preview bubble. The saved effect early-returns (closing only its own `info`) whenever `previewHit` is truthy.
- **e2e gate deviation** (Task 21, spec §6/§7): the authenticated map is unreachable in Playwright (key-less e2e build → `/auth`). `npm run e2e` stays auth-screen-only and UNCHANGED; the map's full-bleed/내위치/sheet/search verification is done via `mapPagePreview.test.tsx` (vitest MapPage mount) + the manual spot-check. Do not write map captures into `e2e/`.
