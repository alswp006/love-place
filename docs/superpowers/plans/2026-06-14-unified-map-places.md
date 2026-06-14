# Unified Map+Places Screen Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
**Goal:** Merge the 장소(`/places`) tab into the 지도(`/`) tab as a single Naver-style screen — map + draggable bottom sheet (search/list/trips/trash) — and make saved-place markers clickable so they highlight and open an InfoWindow bubble with 길찾기 / 가봤어요 / ❤️ actions.
**Architecture:** `MapPage` becomes the orchestrator that owns a shared `selectedId` and instantiates every data hook once (`usePlaces/useWishes/useVisits/useReactions/useProfiles/useCouple` + `useRealtimePlaces`), passing derived data and `selectedId`/`onSelect` to both `NaverMap` and a new `PlaceSheet`. The card list is extracted into `PlaceList`; the sheet is a pointer-driven peek/half/full bottom sheet whose snap transitions come from a pure `sheetSnap` util. Marker↔list↔bubble stay in sync through `selectedId`; the InfoWindow is a single reused `naver.maps.InfoWindow` whose HTML content is rebuilt on state change and wired with one delegated `click` handler reading `data-action`.
**Tech Stack:** React 18 + Vite + TS strict, Supabase (Postgres/RLS/Realtime), TanStack Query, React Router, Naver Maps JS SDK v3, vitest, Playwright.

---

## Phase P-A: IA / routing + skeleton

### Task 1: Drop the 장소 tab and repoint every `/places` CTA to `/`

**Files:**
- Modify: `src/app/tabs.ts` (lines 1, 35, 49, 110–180 — remove 장소 `TabDef`, fix `Bookmark` import, repoint 3 CTAs, fix 지도 hint/subtitle)
- Modify: `src/__tests__/routing.test.tsx` (line 70 assertion + describe titles)
- Test: `src/__tests__/routing.test.tsx`

Steps:

- [ ] Update the routing-test assertion to expect the post-merge href. Edit `src/__tests__/routing.test.tsx` — change line 70 from `expect(cta).toHaveAttribute('href', '/places')` to `expect(cta).toHaveAttribute('href', '/')`. Also rename the two cosmetic titles: `describe('5탭 라우팅 (설계서 §3 IA)'` → `describe('4탭 라우팅 (설계서 §3 IA — 장소→지도 통합)'`, and `it('하단 탭바에 5개 탭이...'` → `it('하단 탭바에 4개 탭이...'`.

- [ ] Run the test — expect FAIL (RecommendPage CtaLink + `/discover` empty action still point at `/places`, and the 장소 tab still exists so the parametrized test still has 5 cases).
  ```
  npm run test -- src/__tests__/routing.test.tsx
  ```
  Expected: the "추천 탭 빈 상태" case fails with `expected '/places' to equal '/'` (CtaLink still `/places`).

- [ ] Repoint the `/discover` empty-state CTA and remove the 장소 `TabDef`. Edit `src/app/tabs.ts`:
  - Line 1 import — drop the now-unused `Bookmark`:
    ```ts
    import { MapPin, CalendarDays, Sparkles, Users, type IconComponent } from '@/components/nav/icons'
    ```
  - 지도(`/`) tab `empty` — remove the self-referential action and fix the hint that names the gone 장소 탭:
    ```ts
    empty: {
      emoji: '🗺️',
      title: '아직 지도에 표시할 장소가 없어요',
      hint: '아래 시트의 검색창에서 첫 가고싶은 곳을 추가하면 여기 별표로 떠요.',
    },
    ```
  - 일정(`/calendar`) tab `empty.action` — repoint to `/`:
    ```ts
    action: { label: '장소부터 모아보기', to: '/' },
    ```
  - DELETE the entire 장소 `TabDef` object (the block with `path: '/places'`, `label: '장소'`, `testId: 'page-places'`, `Icon: Bookmark`).
  - 추천(`/discover`) tab `empty.action` — repoint to `/`:
    ```ts
    action: { label: '가고싶은 곳 추가하기', to: '/' },
    ```

- [ ] Repoint the RecommendPage CtaLink. Edit `src/pages/RecommendPage.tsx` line 138:
  ```tsx
  <CtaLink to="/">가고싶은 곳 추가하기</CtaLink>
  ```

- [ ] Run the test — expect PASS (now 4 parametrized tab cases, CTA href `/`).
  ```
  npm run test -- src/__tests__/routing.test.tsx
  ```
  Expected: all cases green (`page-map`, `page-calendar`, `page-discover`, `page-us` + CTA href `/` + 4 labels).

- [ ] Typecheck — `Bookmark` removal must not leave a dangling reference; PlacesPage still imports things but is untouched this task (it will fail on `tabByPath('/places')` only at runtime, not typecheck). Run:
  ```
  npm run typecheck
  ```
  Expected: PASS (`noUnusedLocals` satisfied — `Bookmark` import gone).

- [ ] Commit.
  ```
  git add src/app/tabs.ts src/__tests__/routing.test.tsx src/pages/RecommendPage.tsx
  git commit -m "$(cat <<'EOF'
refactor(nav): 장소 탭 제거(4탭화)·/places CTA 전부 /로 재지정

- tabs.ts에서 장소 TabDef 삭제 → TabBar·router·라우팅 테스트 자동 4탭화
- 지도 empty hint를 통합 시트 문구로, /calendar·/discover·RecommendPage CTA를 /로
- 미사용 Bookmark import 제거(noUnusedLocals)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

### Task 2: Remove the stale `/places` `PAGES` entry + make the redirect explicit

**Files:**
- Modify: `src/app/router.tsx` (line 13 — remove `PAGES['/places']`; AppLayout children — add explicit `places` → `/` redirect before the `*` catch-all)
- Test: `src/__tests__/routing.test.tsx` (reuse — add a redirect regression case)

> NOTE (TDD framing): After Task 1 removed the 장소 `TabDef`, `tabRoutes` (`TABS.map(...)` in `router.tsx`) no longer generates a `/places` route, so `renderAt('/places')` already falls through the existing catch-all `{ path: '*', element: <Navigate to="/" replace /> }` (router.tsx) → renders `page-map`. The "/places → /" requirement is therefore ALREADY satisfied by the catch-all (dossier 01-routing §2.2/§5). The redirect test below is a **regression guard that stays green**, and the explicit `{ path: 'places', Navigate }` route makes the behavior intentional/self-documenting (so a future explicit route added above the splat cannot silently shadow it). This is NOT a red→green step.

Steps:

- [ ] Add the redirect regression test (stays green — guards the merge behavior). Edit `src/__tests__/routing.test.tsx` — add this `it` inside the `describe` block (after the tab-bar test):
  ```tsx
  it('/places는 지도(/)로 리다이렉트된다(딥링크/북마크 보존)', async () => {
    renderAt('/places')
    expect(await screen.findByTestId('page-map')).toBeInTheDocument()
  })
  ```

- [ ] Run the test — expect PASS (the catch-all already converges `/places` → `/`). Run:
  ```
  npm run test -- src/__tests__/routing.test.tsx
  ```
  Expected: PASS — `/places` lands on `page-map` via the existing `{ path: '*', Navigate to / }` catch-all (the 장소 route was removed in Task 1; the stale `PAGES['/places']` lazy import is dead code, never resolved). This step pins the behavior before we make the redirect explicit.

- [ ] Remove the stale `PAGES` entry and add an explicit, self-documenting redirect. Edit `src/app/router.tsx`:
  - Remove line 13 (`'/places': lazy(() => import('@/pages/PlacesPage')),`) from the `PAGES` record (dead once the 장소 tab is gone — an unused lazy import).
  - Inside the `AppLayout` `children` array, ADD an explicit redirect BEFORE the `{ path: '*', ... }` catch-all:
    ```tsx
    children: [
      ...tabRoutes,
      // /places는 지도(/)로 통합됨 — 북마크/딥링크 보존용 명시적 리다이렉트.
      { path: 'places', element: <Navigate to="/" replace /> },
      // 미지정(로그인 상태) 경로는 지도(/)로.
      { path: '*', element: <Navigate to="/" replace /> },
    ],
    ```

- [ ] Run the test — expect PASS (now served by the explicit `places` route rather than the splat fallthrough).
  ```
  npm run test -- src/__tests__/routing.test.tsx
  ```
  Expected: the `/places` redirect case lands on `page-map`; all other cases green.

- [ ] Typecheck — the router no longer imports PlacesPage but the file still exists (deleted in Task 8). Run:
  ```
  npm run typecheck
  ```
  Expected: PASS (router no longer references PlacesPage; the orphaned file still typechecks against the `tabByPath` signature — its `tabByPath('/places')` call is a runtime throw, not a type error).

- [ ] Commit.
  ```
  git add src/app/router.tsx src/__tests__/routing.test.tsx
  git commit -m "$(cat <<'EOF'
refactor(router): 죽은 /places PAGES import 제거 + 명시적 리다이렉트

- PAGES에서 죽은 /places lazy import 삭제(장소 탭 제거 후 미사용 dead code)
- AppLayout children에 { path: 'places', Navigate to / replace } 추가(catch-all에 의존하지 않는 명시적 딥링크 보존)
- 라우팅 테스트에 /places→/ 리다이렉트 회귀 가드 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

### Task 3: Add the `selectedId` orchestrator scaffold to MapPage

**Files:**
- Modify: `src/pages/MapPage.tsx` (lines 1–2 add `useState`; add `selectedId` state + `onSelect`/`onClose` handlers passed to NaverMap)
- Modify: `src/components/map/NaverMap.tsx` (line 36 — accept optional `selectedId`/`onSelect`/`onClose` props as a no-op scaffold)
- Test: `src/__tests__/routing.test.tsx` (reuse — the existing `page-map` render test must keep passing)

Steps:

- [ ] Extend the `NaverMap` props signature with the selection scaffold (no behavior yet — wired in Phase P-C). Edit `src/components/map/NaverMap.tsx` line 36, replacing the component signature:
  ```tsx
  export function NaverMap({
    places,
    visitedIds,
    selectedId,
    onSelect,
    onClose,
  }: {
    places: MarkerPlace[]
    visitedIds?: Set<string>
    selectedId?: string | null
    onSelect?: (id: string) => void
    onClose?: () => void
  }) {
  ```

- [ ] Add `selectedId` state + handlers to MapPage and pass them down. Edit `src/pages/MapPage.tsx`:
  - Line 1 — add `useState`:
    ```tsx
    import { useMemo, useState } from 'react'
    ```
  - After the `visitedIds` useMemo (around line 31), add:
    ```tsx
    const [selectedId, setSelectedId] = useState<string | null>(null)
    ```
  - Replace the `<NaverMap places={enriched} visitedIds={visitedIds} />` line with:
    ```tsx
    <NaverMap
      places={enriched}
      visitedIds={visitedIds}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onClose={() => setSelectedId(null)}
    />
    ```

- [ ] Run the routing render test — the `/` map screen must still render with the new props.
  ```
  npm run test -- src/__tests__/routing.test.tsx
  ```
  Expected: PASS (NaverMap ignores the new props for now; `page-map` renders).

- [ ] Typecheck.
  ```
  npm run typecheck
  ```
  Expected: PASS (props are optional; no consumer breaks).

- [ ] Commit.
  ```
  git add src/pages/MapPage.tsx src/components/map/NaverMap.tsx
  git commit -m "$(cat <<'EOF'
feat(map): MapPage에 selectedId 오케스트레이터 골격 추가

- MapPage가 selectedId 상태를 보유, NaverMap에 selectedId/onSelect/onClose 전달
- NaverMap 시그니처에 선택 props 추가(이번 커밋은 no-op, P-C에서 와이어링)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

## Phase P-B: drag sheet + list extraction

### Task 4: Pure snap-transition util `sheetSnap.ts`

**Files:**
- Create: `src/lib/places/sheetSnap.ts`
- Create: `src/__tests__/sheetSnap.test.ts`
- Test: `src/__tests__/sheetSnap.test.ts`

Steps:

- [ ] Write the failing unit test. Create `src/__tests__/sheetSnap.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest'
  import { SNAPS, nextSnap, prevSnap, snapForOffset } from '@/lib/places/sheetSnap'

  describe('sheetSnap (시트 스냅 전이 — 순수 로직)', () => {
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

    it('snapForOffset: 가까운 스냅으로 흡착(viewport 높이 기준)', () => {
      const h = 800
      // peek=0.18→translateY≈656, half=0.5→400, full=0.92→64 (translateY = h*(1-ratio))
      expect(snapForOffset(660, h)).toBe('peek')
      expect(snapForOffset(410, h)).toBe('half')
      expect(snapForOffset(80, h)).toBe('full')
    })

    it('snapForOffset: 화면 밖(음수/초과) 입력도 클램프해 가장 가까운 스냅', () => {
      const h = 800
      expect(snapForOffset(-50, h)).toBe('full')
      expect(snapForOffset(99999, h)).toBe('peek')
    })
  })
  ```

- [ ] Run the test — expect FAIL (module does not exist).
  ```
  npm run test -- src/__tests__/sheetSnap.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/lib/places/sheetSnap'`.

- [ ] Implement the util. Create `src/lib/places/sheetSnap.ts`:
  ```ts
  // 드래그 시트 스냅 전이 — 순수 로직(테스트로 못박음). naver/DOM 비의존.
  // ratio = 시트가 차지하는 viewport 비율(높을수록 더 펼침). translateY = height*(1-ratio).

  export type SnapStop = 'peek' | 'half' | 'full'
  export type SnapDef = { id: SnapStop; ratio: number }

  // peek: 핸들+요약만 / half: 절반 / full: 거의 전체(상단 safe-area 여백 남김).
  export const SNAPS: readonly SnapDef[] = [
    { id: 'peek', ratio: 0.18 },
    { id: 'half', ratio: 0.5 },
    { id: 'full', ratio: 0.92 },
  ] as const

  const ORDER: SnapStop[] = ['peek', 'half', 'full']

  /** 한 단계 펼침(탭 대체 버튼·아래→위 드래그). full에서 클램프. */
  export function nextSnap(cur: SnapStop): SnapStop {
    const i = ORDER.indexOf(cur)
    return ORDER[Math.min(i + 1, ORDER.length - 1)]!
  }

  /** 한 단계 접음(위→아래 드래그). peek에서 클램프. */
  export function prevSnap(cur: SnapStop): SnapStop {
    const i = ORDER.indexOf(cur)
    return ORDER[Math.max(i - 1, 0)]!
  }

  /** ratio → 시트 상단 translateY(px). 클수록 아래로 내려감(덜 펼침). */
  export function translateYFor(stop: SnapStop, viewportHeight: number): number {
    const def = SNAPS.find((s) => s.id === stop)!
    return viewportHeight * (1 - def.ratio)
  }

  /** 드래그 종료 시 현재 translateY에 가장 가까운 스냅으로 흡착. */
  export function snapForOffset(translateY: number, viewportHeight: number): SnapStop {
    let best: SnapStop = 'peek'
    let bestDist = Infinity
    for (const s of SNAPS) {
      const y = viewportHeight * (1 - s.ratio)
      const d = Math.abs(translateY - y)
      if (d < bestDist) {
        bestDist = d
        best = s.id
      }
    }
    return best
  }
  ```

- [ ] Run the test — expect PASS.
  ```
  npm run test -- src/__tests__/sheetSnap.test.ts
  ```
  Expected: all 5 cases green.

- [ ] Typecheck.
  ```
  npm run typecheck
  ```
  Expected: PASS.

- [ ] Commit.
  ```
  git add src/lib/places/sheetSnap.ts src/__tests__/sheetSnap.test.ts
  git commit -m "$(cat <<'EOF'
feat(places): 시트 스냅 전이 순수 유틸 sheetSnap + 단위 테스트

- SNAPS(peek/half/full) · nextSnap/prevSnap(클램프) · translateYFor · snapForOffset(흡착)
- DOM/naver 비의존 순수 로직(드래그/탭 시트가 공유)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

### Task 5: Extract `PlaceList` (card list with selection)

**Files:**
- Create: `src/components/places/PlaceList.tsx`
- Create: `src/components/places/PlaceList.module.css`
- Create: `src/__tests__/placeList.test.tsx`
- Test: `src/__tests__/placeList.test.tsx`

Steps:

- [ ] Write the failing render test. Create `src/__tests__/placeList.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from 'vitest'
  import { render, screen, fireEvent } from '@testing-library/react'
  import { PlaceList } from '@/components/places/PlaceList'
  import type { WithWish } from '@/lib/places/wishStatus'
  import type { PlaceRow } from '@/hooks/usePlaces'

  const wishStatus = { wishedByMe: true, wishedByPartner: true, bothWished: true, wishCount: 2, totalPriority: 3, maxPriority: 2 }
  const place: WithWish<PlaceRow> = {
    id: 'p1', name: '칠성조선소', address: '속초', region_label: '속초', lat: 38, lng: 128,
    category: '카페', kakao_place_id: 'k1', added_by: 'u1', version: 1, wish: wishStatus,
  }

  const noop = () => {}
  const baseProps = {
    visible: [place] as WithWish<PlaceRow>[],
    wishes: { byPlace: {}, mine: {} },
    visitedIds: new Set<string>(),
    profiles: {},
    myId: 'u1',
    placesLoading: false,
    placeFilter: 'all' as const,
    selectedId: null as string | null,
    onSelect: noop,
    setPriority: noop,
    priorityPending: false,
    markVisited: { mutate: noop, isPending: false } as never,
    deletePlace: noop,
    deletePending: false,
    onToast: noop,
  }

  describe('PlaceList (카드 리스트 추출)', () => {
    it('장소 이름과 둘 다 찜 배지를 렌더한다', () => {
      render(<PlaceList {...baseProps} />)
      expect(screen.getByText('칠성조선소')).toBeInTheDocument()
      expect(screen.getByText('둘 다 찜')).toBeInTheDocument()
    })

    it('카드 본문 탭 시 onSelect(placeId)를 호출한다', () => {
      const onSelect = vi.fn()
      render(<PlaceList {...baseProps} onSelect={onSelect} />)
      fireEvent.click(screen.getByText('칠성조선소'))
      expect(onSelect).toHaveBeenCalledWith('p1')
    })

    it('로딩 중이면 스켈레톤(아이템 없음)을 보여준다', () => {
      render(<PlaceList {...baseProps} visible={[]} placesLoading />)
      expect(screen.getByRole('status')).toBeInTheDocument()
      expect(screen.queryByText('칠성조선소')).not.toBeInTheDocument()
    })

    it('빈 목록이면 빈 상태 카피를 보여준다', () => {
      render(<PlaceList {...baseProps} visible={[]} />)
      expect(screen.getByText('첫 가고싶은 장소를 추가해보세요')).toBeInTheDocument()
    })
  })
  ```

- [ ] Run the test — expect FAIL (module does not exist).
  ```
  npm run test -- src/__tests__/placeList.test.tsx
  ```
  Expected: FAIL — `Cannot find module '@/components/places/PlaceList'`.

- [ ] Create the component CSS (ported from `PlacesPage.module.css` card/list/wish/badge classes). Create `src/components/places/PlaceList.module.css`:
  ```css
  .listSection {
    display: flex;
    flex-direction: column;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    padding: var(--sp-3);
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    background: var(--c-surface);
  }

  /* 선택된 카드 — 색 + 테두리/배경 이중화(§8) */
  .cardSelected {
    border-color: var(--c-brand);
    background: var(--c-surface-2);
  }

  .cardMain {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
    text-align: left;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 0;
  }

  .cardName {
    font-weight: 600;
  }

  .cardAddr {
    font-size: var(--fs-caption);
    color: var(--c-text-weak);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .badge {
    flex-shrink: 0;
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--c-surface-2);
    color: var(--c-brand);
  }

  /* 찜 상태(3단계) — 색 + 텍스트 라벨 이중화(§8) */
  .wishLine {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-top: 2px;
  }

  .wishBadge {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px solid currentColor;
    white-space: nowrap;
  }

  .wishBoth {
    color: var(--c-track-shared);
  }

  .wishMine {
    color: var(--c-track-mine);
  }

  .wishPartner {
    color: var(--c-track-partner);
  }

  .heartBtn {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    border: none;
    background: transparent;
    color: var(--c-brand);
    cursor: pointer;
    padding: 4px 6px;
    min-height: 44px;
    border-radius: var(--radius-sm);
  }

  .heartBtn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .heart {
    width: 14px;
    height: 14px;
  }

  .visitedBadge {
    font-size: 0.7rem;
    color: var(--c-success);
    font-weight: 600;
    white-space: nowrap;
  }

  .visitBtn {
    border: 1px solid var(--c-border);
    background: transparent;
    color: var(--c-text-weak);
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 0.7rem;
    cursor: pointer;
    min-height: 44px;
    white-space: nowrap;
  }

  .visitBtn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .cardSide {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    flex-shrink: 0;
  }

  .deleteBtn {
    border: none;
    background: transparent;
    color: var(--c-text-weak);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    border-radius: var(--radius-sm);
    min-width: 44px;
    min-height: 44px;
  }

  .deleteBtn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  ```

- [ ] Create the component. Create `src/components/places/PlaceList.tsx`:
  ```tsx
  import { EmptyState } from '@/components/common/EmptyState'
  import { Skeleton } from '@/components/common/Skeleton'
  import { SourceAvatar } from '@/components/common/SourceAvatar'
  import { Heart } from '@/components/nav/icons'
  import type { ProfileMap } from '@/hooks/useProfiles'
  import type { WishData } from '@/hooks/useWishes'
  import type { PlaceRow } from '@/hooks/usePlaces'
  import type { UseMutationResult } from '@tanstack/react-query'
  import { cyclePriority, MAX_PRIORITY, type WishStatus, type WithWish } from '@/lib/places/wishStatus'
  import styles from './PlaceList.module.css'

  type MarkVisited = UseMutationResult<void, Error, { placeId: string; visitDate?: string }>

  // 장소 카드 리스트(PlacesPage에서 추출). 카드 본문 탭 → onSelect(placeId)로 지도/말풍선 동기화.
  export function PlaceList({
    visible,
    wishes,
    visitedIds,
    profiles,
    myId,
    placesLoading,
    placeFilter,
    selectedId,
    onSelect,
    setPriority,
    priorityPending,
    markVisited,
    deletePlace,
    deletePending,
    onToast,
  }: {
    visible: WithWish<PlaceRow>[]
    wishes: WishData | undefined
    visitedIds: Set<string>
    profiles: ProfileMap
    myId: string | null
    placesLoading: boolean
    placeFilter: 'all' | 'wish' | 'visited'
    selectedId: string | null
    onSelect: (id: string) => void
    setPriority: (v: { wishId: string; expectedVersion: number; priority: number }) => void
    priorityPending: boolean
    markVisited: MarkVisited
    deletePlace: (
      v: { id: string; expectedVersion: number },
      opts?: { onSuccess?: () => void },
    ) => void
    deletePending: boolean
    onToast: (m: string) => void
  }) {
    return (
      <section className={styles.listSection} aria-label="장소 목록">
        {placesLoading ? (
          <Skeleton count={4} label="가고싶은 장소 불러오는 중" />
        ) : visible.length === 0 ? (
          <EmptyState
            emoji="📍"
            title={placeFilter === 'visited' ? '아직 가본 곳이 없어요' : '첫 가고싶은 장소를 추가해보세요'}
            hint={
              placeFilter === 'visited'
                ? '장소 카드의 "다녀왔어요"를 누르면 가본 곳으로 기록돼요.'
                : '위 검색창에 장소 이름을 입력하면 후보가 떠요.'
            }
          />
        ) : (
          <ul className={styles.list}>
            {visible.map((p) => {
              const myWish = wishes?.mine[p.id]
              const visited = visitedIds.has(p.id)
              const isSelected = p.id === selectedId
              return (
                <li key={p.id} className={`${styles.card} ${isSelected ? styles.cardSelected : ''}`}>
                  <button
                    type="button"
                    className={styles.cardMain}
                    onClick={() => onSelect(p.id)}
                    aria-pressed={isSelected}
                    aria-label={`${p.name} 지도에서 보기`}
                  >
                    <span className={styles.cardName}>{p.name}</span>
                    {p.address ? <span className={styles.cardAddr}>{p.address}</span> : null}
                    <span className={styles.wishLine}>
                      <WishBadge wish={p.wish} />
                    </span>
                  </button>
                  <div className={styles.cardSide}>
                    {myWish ? (
                      <PriorityStepper
                        priority={myWish.priority}
                        disabled={priorityPending}
                        onCycle={() =>
                          setPriority({
                            wishId: myWish.wishId,
                            expectedVersion: myWish.version,
                            priority: cyclePriority(myWish.priority),
                          })
                        }
                      />
                    ) : null}
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
                    <SourceAvatar userId={p.added_by} profiles={profiles} myId={myId} context=" 추가" />
                    {p.region_label ? <span className={styles.badge}>{p.region_label}</span> : null}
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() =>
                        deletePlace(
                          { id: p.id, expectedVersion: p.version },
                          { onSuccess: () => onToast('휴지통으로 옮겼어요 — 아래 휴지통에서 복구할 수 있어요') },
                        )
                      }
                      disabled={deletePending}
                      aria-label={`${p.name} 휴지통으로 보내기`}
                    >
                      🗑
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    )
  }

  // 찜 상태 — 색 + 텍스트 라벨 이중화(§8 색각 이상 대응).
  function WishBadge({ wish }: { wish: WishStatus }) {
    if (wish.wishCount === 0) return null
    const label = wish.bothWished ? '둘 다 찜' : wish.wishedByMe ? '나만 찜' : '상대만 찜'
    const cls = wish.bothWished ? styles.wishBoth : wish.wishedByMe ? styles.wishMine : styles.wishPartner
    return (
      <span className={`${styles.wishBadge} ${cls}`}>
        {wish.bothWished ? '💑 ' : ''}
        {label}
      </span>
    )
  }

  // 내 우선순위 하트 — 탭하면 0→1→2→3→0 순환(낙관적 락 저장). 하트≠리액션(ux §2).
  function PriorityStepper({
    priority,
    disabled,
    onCycle,
  }: {
    priority: number
    disabled: boolean
    onCycle: () => void
  }) {
    return (
      <button
        type="button"
        className={styles.heartBtn}
        onClick={onCycle}
        disabled={disabled}
        aria-label={`내 우선순위 ${priority}단계 (눌러서 변경)`}
      >
        {Array.from({ length: MAX_PRIORITY }, (_, i) => (
          <Heart key={i} filled={i < priority} className={styles.heart} />
        ))}
      </button>
    )
  }
  ```

- [ ] Run the test — expect PASS.
  ```
  npm run test -- src/__tests__/placeList.test.tsx
  ```
  Expected: all 4 cases green.

- [ ] Typecheck.
  ```
  npm run typecheck
  ```
  Expected: PASS.

- [ ] Commit.
  ```
  git add src/components/places/PlaceList.tsx src/components/places/PlaceList.module.css src/__tests__/placeList.test.tsx
  git commit -m "$(cat <<'EOF'
feat(places): PlaceList 카드 리스트 추출(WishBadge·PriorityStepper·가봤어요·삭제)

- PlacesPage 카드 리스트를 재사용 컴포넌트로 분리, 카드 탭→onSelect(placeId)
- 선택 카드 색+테두리 이중화(§8), 빈/로딩 상태 유지
- 단위 테스트(렌더·선택 콜백·스켈레톤·빈 상태)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

### Task 6: Extract `TrashSection` into its own component

**Files:**
- Create: `src/components/places/TrashSection.tsx`
- Create: `src/components/places/TrashSection.module.css`
- Create: `src/__tests__/trashSection.test.tsx`
- Test: `src/__tests__/trashSection.test.tsx`

Steps:

- [ ] Write the failing render test. Create `src/__tests__/trashSection.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from 'vitest'
  import { render, screen, fireEvent } from '@testing-library/react'
  import { TrashSection } from '@/components/places/TrashSection'
  import type { TrashPlaceRow } from '@/hooks/usePlaceTrash'

  const item: TrashPlaceRow = {
    id: 't1', name: '지운 카페', address: null, region_label: null, deleted_at: '2026-06-14', version: 2,
  }

  describe('TrashSection (휴지통 추출)', () => {
    it('닫힌 상태에선 토글만 보이고 항목은 숨긴다', () => {
      render(<TrashSection open={false} onToggle={() => {}} items={[item]} busy={false} onRestore={() => {}} />)
      expect(screen.getByText(/휴지통/)).toBeInTheDocument()
      expect(screen.queryByText('지운 카페')).not.toBeInTheDocument()
    })

    it('열린 상태에서 복구 버튼 클릭 시 onRestore(item)을 호출한다', () => {
      const onRestore = vi.fn()
      render(<TrashSection open onToggle={() => {}} items={[item]} busy={false} onRestore={onRestore} />)
      fireEvent.click(screen.getByRole('button', { name: '복구' }))
      expect(onRestore).toHaveBeenCalledWith(item)
    })

    it('열렸지만 비어 있으면 빈 카피를 보여준다', () => {
      render(<TrashSection open onToggle={() => {}} items={[]} busy={false} onRestore={() => {}} />)
      expect(screen.getByText('삭제한 장소가 없어요.')).toBeInTheDocument()
    })
  })
  ```

- [ ] Run the test — expect FAIL.
  ```
  npm run test -- src/__tests__/trashSection.test.tsx
  ```
  Expected: FAIL — `Cannot find module '@/components/places/TrashSection'`.

- [ ] Create the CSS (ported from `PlacesPage.module.css` trash classes). Create `src/components/places/TrashSection.module.css`:
  ```css
  .trash {
    margin-top: var(--sp-2);
    border-top: 1px solid var(--c-border);
    padding-top: var(--sp-2);
  }

  .trashToggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    border: none;
    background: transparent;
    color: var(--c-text-weak);
    cursor: pointer;
    padding: var(--sp-2);
    font-size: var(--fs-caption);
    min-height: 44px;
  }

  .trashEmpty {
    font-size: var(--fs-caption);
    color: var(--c-text-weak);
    text-align: center;
    padding: var(--sp-3);
  }

  .trashList {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .trashItem {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    border: 1px dashed var(--c-border);
    border-radius: var(--radius-sm);
    color: var(--c-text-weak);
  }

  .trashName {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .restoreBtn {
    flex-shrink: 0;
    border: 1px solid var(--c-brand);
    background: transparent;
    color: var(--c-brand);
    cursor: pointer;
    font-size: var(--fs-caption);
    padding: 4px 12px;
    border-radius: 999px;
    min-height: 44px;
  }

  .restoreBtn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  ```

- [ ] Create the component. Create `src/components/places/TrashSection.tsx`:
  ```tsx
  import type { TrashPlaceRow } from '@/hooks/usePlaceTrash'
  import styles from './TrashSection.module.css'

  // 휴지통(D3) — 삭제는 복구 가능(물리삭제 아님). "상대가 지운 우리 추억"도 둘 다 복구.
  export function TrashSection({
    open,
    onToggle,
    items,
    busy,
    onRestore,
  }: {
    open: boolean
    onToggle: () => void
    items: TrashPlaceRow[]
    busy: boolean
    onRestore: (t: TrashPlaceRow) => void
  }) {
    return (
      <section className={styles.trash} aria-label="휴지통">
        <button type="button" className={styles.trashToggle} onClick={onToggle} aria-expanded={open}>
          <span>🗑 휴지통{open && items.length > 0 ? ` (${items.length})` : ''}</span>
          <span aria-hidden>{open ? '▲' : '▼'}</span>
        </button>
        {open ? (
          items.length === 0 ? (
            <p className={styles.trashEmpty}>삭제한 장소가 없어요.</p>
          ) : (
            <ul className={styles.trashList}>
              {items.map((t) => (
                <li key={t.id} className={styles.trashItem}>
                  <span className={styles.trashName}>{t.name}</span>
                  <button
                    type="button"
                    className={styles.restoreBtn}
                    onClick={() => onRestore(t)}
                    disabled={busy}
                  >
                    복구
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </section>
    )
  }
  ```

- [ ] Run the test — expect PASS.
  ```
  npm run test -- src/__tests__/trashSection.test.tsx
  ```
  Expected: all 3 cases green.

- [ ] Typecheck.
  ```
  npm run typecheck
  ```
  Expected: PASS.

- [ ] Commit.
  ```
  git add src/components/places/TrashSection.tsx src/components/places/TrashSection.module.css src/__tests__/trashSection.test.tsx
  git commit -m "$(cat <<'EOF'
refactor(places): TrashSection을 PlacesPage에서 별도 컴포넌트로 추출

- 휴지통 토글/복구 UI를 재사용 컴포넌트로 분리(PlaceSheet가 호스팅)
- 단위 테스트(닫힘/열림 복구 콜백/빈 상태)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

### Task 7: Build the draggable `PlaceSheet`

**Files:**
- Create: `src/components/places/PlaceSheet.tsx`
- Create: `src/components/places/PlaceSheet.module.css`
- Create: `src/__tests__/placeSheet.test.tsx`
- Test: `src/__tests__/placeSheet.test.tsx`

> NOTE: The sheet hosts the filter chips in a **peek-pinned header** (`data-peek-pinned="true"`) so they are visible at the `peek` snap (ratio 0.18) per spec §5 (peek content = handle + summary + filter chips). The search bar is NOT in the sheet — it is a top overlay over the map (Task 7b) per spec §5, preserving the ≤3-tap save flow. The sheet also accepts `selectedId` and bumps `peek`→`half` when a marker/card is selected (spec §6 (c)).

Steps:

- [ ] Write the failing render/interaction test. Create `src/__tests__/placeSheet.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from 'vitest'
  import { render, screen, fireEvent } from '@testing-library/react'
  import { QueryClientProvider, QueryClient } from '@tanstack/react-query'

  // PlaceSheet는 데이터 훅(useWishes/useVisits 등)을 직접 호출하지 않고 props로 받는 표현형 컴포넌트.
  // 검색(PlaceSearch)은 시트가 아니라 지도 위 상단 오버레이(MapPage)로 옮겨졌으므로 여기서 mock하지 않는다.
  // TripsSection은 useTrips를 쓰므로 가벼운 QueryClient만 있으면 되지만 렌더 단순화를 위해 mock.
  vi.mock('@/components/places/TripsSection', () => ({
    TripsSection: () => <div data-testid="trips-section" />,
  }))

  import { OfflineQueueProvider } from '@/state/OfflineQueueProvider'
  import { PlaceSheet } from '@/components/places/PlaceSheet'

  // PlaceSheet가 보유하는 쓰기 훅(useSetWishPriority/useDeletePlace/useRestorePlace)은 내부에서
  // useOfflineQueue()를 호출 → <OfflineQueueProvider> 조상이 없으면 throw. 따라서 시트를 마운트하는
  // 모든 테스트는 OfflineQueueProvider로 감싼다. (jsdom에는 indexedDB가 없어 outboxStore가 자동으로
  // 메모리 스토어로 폴백하고 navigator.onLine도 정의돼 있으므로 추가 mock은 불필요.)
  function renderSheet(over: Partial<Parameters<typeof PlaceSheet>[0]> = {}) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const props: Parameters<typeof PlaceSheet>[0] = {
      coupleId: 'c1',
      myId: 'u1',
      coupleActive: true,
      places: [],
      wishes: { byPlace: {}, mine: {} },
      visits: [],
      visitedIds: new Set<string>(),
      profiles: {},
      placesLoading: false,
      selectedId: null,
      onSelect: () => {},
      ...over,
    }
    return render(
      <QueryClientProvider client={qc}>
        <OfflineQueueProvider>
          <PlaceSheet {...props} />
        </OfflineQueueProvider>
      </QueryClientProvider>,
    )
  }

  describe('PlaceSheet (드래그 시트)', () => {
    it('핸들에 탭 대체 버튼(스냅 전환)을 제공한다(제스처 발견성 보완)', () => {
      renderSheet()
      expect(screen.getByRole('button', { name: /시트 펼치기|시트 단계 전환/ })).toBeInTheDocument()
    })

    it('탭 대체 버튼 클릭 시 시트 단계가 올라간다(aria-label 변화)', () => {
      renderSheet()
      const btn = screen.getByRole('button', { name: /시트/ })
      fireEvent.click(btn)
      // peek→half로 올라가면 다음 라벨은 여전히 펼치기(half→full)거나 dialog가 확장됨.
      expect(screen.getByRole('dialog', { name: '장소 시트' })).toBeInTheDocument()
    })

    it('필터 칩(전체/가고싶음/가봤음)은 peek 헤더(핸들/요약 영역)에 렌더된다(§5 peek 콘텐츠)', () => {
      renderSheet()
      // peek-pinned 헤더 그룹 — body(접힘 영역)가 아니라 항상 보이는 영역에 있어야 한다.
      const group = screen.getByRole('group', { name: '장소 필터' })
      expect(group).toBeInTheDocument()
      expect(group.closest('[data-peek-pinned="true"]')).not.toBeNull()
      expect(screen.getByRole('button', { name: '전체' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '가고싶은' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '가본' })).toBeInTheDocument()
    })

    it('peek에서 selectedId가 생기면 half로 살짝 올린다(§6 (c))', () => {
      // 같은 provider 트리에서 selectedId만 바꿔 effect가 발화하도록(리마운트 시 내부 snap이 초기화됨).
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const Harness = ({ selectedId }: { selectedId: string | null }) => (
        <QueryClientProvider client={qc}>
          <OfflineQueueProvider>
            <PlaceSheet
              coupleId="c1"
              myId="u1"
              coupleActive
              places={[]}
              wishes={{ byPlace: {}, mine: {} }}
              visits={[]}
              visitedIds={new Set<string>()}
              profiles={{}}
              placesLoading={false}
              selectedId={selectedId}
              onSelect={() => {}}
            />
          </OfflineQueueProvider>
        </QueryClientProvider>
      )
      const { rerender } = render(<Harness selectedId={null} />)
      const sheet = screen.getByRole('dialog', { name: '장소 시트' })
      const peekY = sheet.style.transform
      // 선택 발생(마커 클릭 등) → peek면 half로 상향(같은 인스턴스, prop만 변경).
      rerender(<Harness selectedId="p1" />)
      expect(sheet.style.transform).not.toBe(peekY)
    })

    it('커플 미연결이면 연결 안내 빈 상태를 보여준다', () => {
      renderSheet({ coupleActive: false })
      expect(screen.getByText('먼저 상대와 연결해요')).toBeInTheDocument()
    })

    it('연결 상태면 필터·여행 섹션을 호스팅한다(검색은 지도 오버레이로 분리)', () => {
      renderSheet()
      expect(screen.queryByTestId('place-search')).not.toBeInTheDocument()
      expect(screen.getByTestId('trips-section')).toBeInTheDocument()
      expect(screen.getByRole('group', { name: '장소 필터' })).toBeInTheDocument()
    })
  })
  ```

- [ ] Run the test — expect FAIL.
  ```
  npm run test -- src/__tests__/placeSheet.test.tsx
  ```
  Expected: FAIL — `Cannot find module '@/components/places/PlaceSheet'`.

- [ ] Create the sheet CSS. Create `src/components/places/PlaceSheet.module.css`:
  ```css
  /* 시트는 viewport에 고정, transform: translateY로 스냅 위치 제어(드래그는 JS, 정착은 transition).
     reduce-motion에서 tokens.css가 transition-duration을 0으로 강제 → 즉시 전환(ux §5). */
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: 100dvh;
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
    touch-action: none;
  }

  /* peek-pinned 헤더 — peek 비율(0.18)에서도 항상 보이는 영역: 핸들 + 요약 + 필터 칩(§5 peek 콘텐츠). */
  .peekHeader {
    display: flex;
    flex-direction: column;
    padding: var(--sp-2) var(--sp-4) var(--sp-2);
    flex-shrink: 0;
  }

  .handleRow {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
  }

  .handle {
    width: 40px;
    height: 4px;
    border-radius: 999px;
    background: var(--c-border);
    margin-bottom: var(--sp-2);
  }

  /* 탭 대체 버튼(제스처 발견성↓ 보완, ux §1) — 핸들 영역 전체가 스냅 전환 버튼. */
  .handleBtn {
    width: 100%;
    border: none;
    background: transparent;
    color: var(--c-text-weak);
    cursor: pointer;
    padding: var(--sp-1) 0 var(--sp-2);
    font-size: var(--fs-caption);
    min-height: 44px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .summary {
    font-weight: 600;
    color: var(--c-text);
  }

  .body {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: var(--sp-3) var(--sp-4) calc(var(--sp-6) + 72px + var(--safe-bottom));
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  /* 필터 칩 행 — peek 헤더 안(요약 아래). 좁은 화면에서 가로 스크롤 허용(고정 높이 박스 금지, ux §4). */
  .filterRow {
    display: flex;
    gap: var(--sp-2);
    margin-top: var(--sp-2);
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .filterChip {
    border: 1px solid var(--c-border);
    background: var(--c-surface);
    color: var(--c-text-weak);
    border-radius: 999px;
    padding: 4px 14px;
    font-size: var(--fs-caption);
    cursor: pointer;
    min-height: 44px;
  }

  .filterOn {
    background: var(--c-surface-2);
    color: var(--c-brand);
    font-weight: 600;
    border-color: var(--c-brand);
  }
  ```

- [ ] Create the sheet component. Create `src/components/places/PlaceSheet.tsx`:
  ```tsx
  import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
  import { EmptyState } from '@/components/common/EmptyState'
  import { ConflictBanner } from '@/components/common/ConflictBanner'
  import { Toast } from '@/components/common/Toast'
  import { useToast } from '@/hooks/useToast'
  import { TripsSection } from '@/components/places/TripsSection'
  import { PlaceList } from '@/components/places/PlaceList'
  import { TrashSection } from '@/components/places/TrashSection'
  import { useMarkVisited, type VisitRow } from '@/hooks/useVisits'
  import { useSetWishPriority } from '@/hooks/useSetWishPriority'
  import { useTrashPlaces, useDeletePlace, useRestorePlace } from '@/hooks/usePlaceTrash'
  import { useConflict } from '@/lib/sync/useConflict'
  import type { ProfileMap } from '@/hooks/useProfiles'
  import type { WishData } from '@/hooks/useWishes'
  import type { PlaceRow } from '@/hooks/usePlaces'
  import type { WithWish } from '@/lib/places/wishStatus'
  import { nextSnap, prevSnap, snapForOffset, translateYFor, type SnapStop } from '@/lib/places/sheetSnap'
  import styles from './PlaceSheet.module.css'

  // 통합 화면 하단 드래그 시트 — 검색 + 필터 + PlaceList + Trips + 휴지통. peek/half/full 스냅.
  // 데이터는 상위(MapPage)에서 props로 받고, 쓰기 mutation(우선순위/삭제/복구/방문)만 자체 보유.
  export function PlaceSheet({
    coupleId,
    myId,
    coupleActive,
    places,
    wishes,
    visits,
    visitedIds,
    profiles,
    placesLoading,
    selectedId,
    onSelect,
  }: {
    coupleId: string | null
    myId: string | null
    coupleActive: boolean
    places: WithWish<PlaceRow>[]
    wishes: WishData | undefined
    visits: VisitRow[]
    visitedIds: Set<string>
    profiles: ProfileMap
    placesLoading: boolean
    selectedId: string | null
    onSelect: (id: string) => void
  }) {
    const toast = useToast()
    const conflict = useConflict()
    const markVisited = useMarkVisited(coupleId, myId)
    const { setPriority, isPending: priorityPending } = useSetWishPriority(coupleId, myId, conflict.flag)
    const { deletePlace, isPending: deletePending } = useDeletePlace(coupleId, myId, conflict.flag)
    const { restorePlace, isPending: restorePending } = useRestorePlace(coupleId, myId, conflict.flag)
    const [trashOpen, setTrashOpen] = useState(false)
    const { data: trash } = useTrashPlaces(coupleId, trashOpen)
    const [placeFilter, setPlaceFilter] = useState<'all' | 'wish' | 'visited'>('all')

    const visible = useMemo(() => {
      if (placeFilter === 'wish') return places.filter((p) => !visitedIds.has(p.id))
      if (placeFilter === 'visited') return places.filter((p) => visitedIds.has(p.id))
      return places
    }, [places, placeFilter, visitedIds])

    // 스냅 상태 + 드래그 — transform: translateY로 위치. JS 드래그는 애니메이션이 아니라 즉시 반영,
    // 손 뗀 뒤 정착만 CSS transition(reduce-motion이 0으로 만듦, ux §5).
    const [snap, setSnap] = useState<SnapStop>('peek')
    const [dragY, setDragY] = useState<number | null>(null)
    const sheetRef = useRef<HTMLDivElement>(null)
    const dragStart = useRef<{ pointerY: number; baseY: number } | null>(null)
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800
    const restY = translateYFor(snap, vh)
    const translateY = dragY ?? restY

    // 마커 클릭/리스트 탭으로 selectedId가 생기고 시트가 peek면 half로 살짝 올린다(§6 (c)).
    // 이미 half/full이면 사용자가 펼친 상태를 존중(강제로 더 올리거나 내리지 않음).
    useEffect(() => {
      if (selectedId && snap === 'peek') setSnap('half')
    }, [selectedId, snap])

    const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
      sheetRef.current?.style.setProperty('transition', 'none')
      dragStart.current = { pointerY: e.clientY, baseY: restY }
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    }
    const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!dragStart.current) return
      const dy = e.clientY - dragStart.current.pointerY
      const next = Math.max(0, Math.min(vh, dragStart.current.baseY + dy))
      setDragY(next)
    }
    const endDrag = () => {
      sheetRef.current?.style.removeProperty('transition')
      if (dragY != null) setSnap(snapForOffset(dragY, vh))
      setDragY(null)
      dragStart.current = null
    }

    // 탭 대체(제스처 발견성↓ 보완, ux §1): full이면 한 단계 접고, 아니면 한 단계 펼친다.
    const cycleSnap = () => setSnap((s) => (s === 'full' ? prevSnap(s) : nextSnap(s)))
    const handleLabel = snap === 'full' ? '시트 단계 전환(접기)' : '시트 펼치기'

    return (
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="false"
        aria-label="장소 시트"
        style={{ transform: `translateY(${translateY}px)` }}
      >
        {/* peek-pinned 헤더 — peek 비율에서도 항상 보임: 핸들 + 요약 + 필터 칩(§5 peek 콘텐츠). */}
        <div className={styles.peekHeader} data-peek-pinned="true">
          <div className={styles.handleRow}>
            <span className={styles.handle} aria-hidden />
            <button
              type="button"
              className={styles.handleBtn}
              onClick={cycleSnap}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              aria-label={handleLabel}
            >
              <span className={styles.summary}>우리 장소 {places.length}곳</span>
            </button>
          </div>

          {coupleActive ? (
            <div className={styles.filterRow} role="group" aria-label="장소 필터">
              {(
                [
                  ['all', '전체'],
                  ['wish', '가고싶은'],
                  ['visited', '가본'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.filterChip} ${placeFilter === key ? styles.filterOn : ''}`}
                  aria-pressed={placeFilter === key}
                  onClick={() => setPlaceFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {!coupleActive ? (
          <div className={styles.body}>
            <EmptyState
              emoji="💑"
              title="먼저 상대와 연결해요"
              hint="'우리' 탭에서 초대 코드로 연결하면, 둘이 함께 장소를 모을 수 있어요."
            />
          </div>
        ) : (
          <div className={styles.body}>
            {conflict.conflict ? <ConflictBanner onDismiss={conflict.clear} /> : null}

            <PlaceList
              visible={visible}
              wishes={wishes}
              visitedIds={visitedIds}
              profiles={profiles}
              myId={myId}
              placesLoading={placesLoading}
              placeFilter={placeFilter}
              selectedId={selectedId}
              onSelect={onSelect}
              setPriority={setPriority}
              priorityPending={priorityPending}
              markVisited={markVisited}
              deletePlace={deletePlace}
              deletePending={deletePending}
              onToast={toast.show}
            />

            <TripsSection coupleId={coupleId} myId={myId} visits={visits} />

            <TrashSection
              open={trashOpen}
              onToggle={() => setTrashOpen((v) => !v)}
              items={trash ?? []}
              busy={restorePending}
              onRestore={(t) => restorePlace({ id: t.id, expectedVersion: t.version })}
            />
          </div>
        )}
        <Toast msg={toast.msg} />
      </div>
    )
  }
  ```

- [ ] Run the test — expect PASS.
  ```
  npm run test -- src/__tests__/placeSheet.test.tsx
  ```
  Expected: all 6 cases green (handle button, dialog expand, peek-pinned filter group, peek→half on select, not-connected empty state, hosted sections without search).

- [ ] Typecheck — confirm `markVisited` raw mutation type and `useSetWishPriority` wrapper match PlaceList props.
  ```
  npm run typecheck
  ```
  Expected: PASS.

- [ ] Commit.
  ```
  git add src/components/places/PlaceSheet.tsx src/components/places/PlaceSheet.module.css src/__tests__/placeSheet.test.tsx
  git commit -m "$(cat <<'EOF'
feat(places): 드래그 하단 시트 PlaceSheet(peek/half/full) 신설

- 포인터 드래그 + 탭 대체 버튼(스냅 전환, ux §1), sheetSnap 유틸로 정착
- peek 헤더(핸들+요약+필터 칩)는 항상 보이게 고정(§5 peek 콘텐츠), 검색은 지도 오버레이로 분리
- selectedId 발생 시 peek면 half로 상향(§6 (c)), PlaceList·TripsSection·휴지통 호스팅
- role=dialog + aria-label, reduce-motion은 transition 0으로 즉시 전환(§5)
- 단위 테스트(핸들 버튼/dialog/peek 필터/peek→half/미연결 빈상태/호스팅 섹션)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

### Task 7b: `MapSearchOverlay` — PlaceSearch as a top overlay over the map (spec §5, ≤3-tap)

**Files:**
- Create: `src/components/places/MapSearchOverlay.tsx`
- Create: `src/components/places/MapSearchOverlay.module.css`
- Create: `src/__tests__/mapSearchOverlay.test.tsx`
- Test: `src/__tests__/mapSearchOverlay.test.tsx`

> WHY: Spec §5 requires the search bar to move to a TOP OVERLAY over the map ("검색바 — 지도 위 상단 오버레이로 PlaceSearch 이전. 위시 저장 ≤3탭 유지"). If search lived inside the sheet body it would be hidden at the `peek` snap (ratio 0.18), forcing an extra "expand sheet" tap before the search input is reachable — breaking the ≤3-tap save flow (ux §3). Anchoring `PlaceSearch` to the top of the map area keeps the input visible regardless of sheet snap, so the save flow stays 검색 입력 → 후보 탭 → 저장 (≤3 taps).

Steps:

- [ ] Write the failing render/regression test. Create `src/__tests__/mapSearchOverlay.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from 'vitest'
  import { render, screen } from '@testing-library/react'

  // PlaceSearch는 useKakaoSearch/useSavePlace(오프라인 큐)에 의존 → 오버레이 단위 테스트에선 mock.
  vi.mock('@/components/places/PlaceSearch', () => ({
    PlaceSearch: ({ coupleId }: { coupleId: string | null }) => (
      <input data-testid="place-search-input" aria-label="장소 검색" data-couple={coupleId ?? ''} />
    ),
  }))

  import { MapSearchOverlay } from '@/components/places/MapSearchOverlay'

  describe('MapSearchOverlay (지도 위 상단 검색 오버레이, spec §5)', () => {
    it('PlaceSearch를 coupleId와 함께 렌더한다', () => {
      render(<MapSearchOverlay coupleId="c1" />)
      const input = screen.getByTestId('place-search-input')
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('data-couple', 'c1')
    })

    it('검색 입력은 지도 상단 오버레이(시트 바깥)에 앵커된다 — peek에서도 즉시 도달(≤3탭 보존)', () => {
      const { container } = render(<MapSearchOverlay coupleId="c1" />)
      // 오버레이 컨테이너가 검색 입력을 직접 감싸고 data-search-overlay로 표식 → 시트 body 의존 없음.
      const overlay = container.querySelector('[data-search-overlay="true"]')
      expect(overlay).not.toBeNull()
      expect(overlay?.querySelector('[data-testid="place-search-input"]')).not.toBeNull()
    })
  })
  ```

- [ ] Run the test — expect FAIL.
  ```
  npm run test -- src/__tests__/mapSearchOverlay.test.tsx
  ```
  Expected: FAIL — `Cannot find module '@/components/places/MapSearchOverlay'`.

- [ ] Create the overlay CSS. Create `src/components/places/MapSearchOverlay.module.css`:
  ```css
  /* 지도 위 상단 검색 오버레이 — 시트(z-index 45)보다 위, Toast(60) 아래. 시트 스냅과 무관하게 항상 보임. */
  .overlay {
    position: absolute;
    top: calc(var(--safe-top) + var(--sp-2));
    left: var(--sp-3);
    right: var(--sp-3);
    max-width: 480px;
    margin: 0 auto;
    z-index: 50;
    background: var(--c-surface);
    border-radius: var(--radius);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.16);
    padding: var(--sp-2);
  }
  ```

- [ ] Create the overlay component. Create `src/components/places/MapSearchOverlay.tsx`:
  ```tsx
  import { PlaceSearch } from '@/components/places/PlaceSearch'
  import styles from './MapSearchOverlay.module.css'

  // 지도 위 상단 검색 오버레이(spec §5) — PlaceSearch를 시트가 아니라 지도 영역 상단에 고정.
  // 시트 스냅(peek/half/full)과 무관하게 검색 입력이 항상 보여 위시 저장 ≤3탭 흐름을 보존(ux §3).
  export function MapSearchOverlay({ coupleId }: { coupleId: string | null }) {
    return (
      <div className={styles.overlay} data-search-overlay="true">
        <PlaceSearch coupleId={coupleId} />
      </div>
    )
  }
  ```

- [ ] Run the test — expect PASS.
  ```
  npm run test -- src/__tests__/mapSearchOverlay.test.tsx
  ```
  Expected: both cases green (PlaceSearch rendered with coupleId; input anchored in the `data-search-overlay` container outside the sheet).

- [ ] Typecheck.
  ```
  npm run typecheck
  ```
  Expected: PASS.

- [ ] Commit.
  ```
  git add src/components/places/MapSearchOverlay.tsx src/components/places/MapSearchOverlay.module.css src/__tests__/mapSearchOverlay.test.tsx
  git commit -m "$(cat <<'EOF'
feat(places): 지도 위 상단 검색 오버레이 MapSearchOverlay(spec §5)

- PlaceSearch를 시트 body에서 지도 영역 상단 오버레이로 분리(z-index 50, 시트 45 위)
- 시트 스냅과 무관하게 검색 입력 항상 노출 → 위시 저장 ≤3탭 흐름 보존(ux §3)
- 단위/회귀 테스트(coupleId 전달·시트 바깥 앵커)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

### Task 8: Wire PlaceSheet + MapSearchOverlay into MapPage and delete PlacesPage

**Files:**
- Modify: `src/pages/MapPage.tsx` (full rewrite of the orchestrator body — add profiles + coupleActive, render MapSearchOverlay over the map + PlaceSheet; remove the empty-state branch for missing places since the sheet shows it)
- Modify: `src/pages/MapPage.module.css` (make `.mapWrap` a positioning context for the absolute search overlay, behind the fixed sheet)
- Delete: `src/pages/PlacesPage.tsx`
- Delete: `src/pages/PlacesPage.module.css`
- Test: `src/__tests__/routing.test.tsx` (reuse), `src/__tests__/placeSheet.test.tsx` (reuse)

Steps:

- [ ] Rewrite MapPage as the orchestrator. Replace the full contents of `src/pages/MapPage.tsx`:
  ```tsx
  import { useMemo, useState } from 'react'
  import { ScreenScaffold } from '@/components/common/ScreenScaffold'
  import { EmptyState } from '@/components/common/EmptyState'
  import { NaverMap } from '@/components/map/NaverMap'
  import { TodayCard } from '@/components/common/TodayCard'
  import { PlaceSheet } from '@/components/places/PlaceSheet'
  import { MapSearchOverlay } from '@/components/places/MapSearchOverlay'
  import { isNaverMapConfigured } from '@/lib/naver/loadNaverMaps'
  import { useAuth } from '@/state/auth'
  import { useCouple } from '@/hooks/useCouple'
  import { usePlaces } from '@/hooks/usePlaces'
  import { useProfiles } from '@/hooks/useProfiles'
  import { useWishes } from '@/hooks/useWishes'
  import { useVisits } from '@/hooks/useVisits'
  import { useReactions } from '@/hooks/useReactions'
  import { useRealtimePlaces } from '@/hooks/useRealtimePlaces'
  import { attachAndSortWishes } from '@/lib/places/wishStatus'
  import { tabByPath } from '@/app/tabs'
  import styles from './MapPage.module.css'

  // 🗺️ 지도 — 첫 화면이자 장소 통합 오케스트레이터(§5.5). 네이버 지도 + 드래그 시트.
  // 훅을 여기서 한 번만 호출하고(중복 realtime 구독 방지) selectedId를 지도/시트가 공유.
  export default function MapPage() {
    const tab = tabByPath('/') // 지도 = index 탭
    const { user } = useAuth()
    const myId = user?.id ?? null
    const { data: couple } = useCouple()
    const coupleId = couple?.coupleId ?? null
    const coupleActive = couple?.status === 'ACTIVE'
    const { data: places, isLoading: placesLoading } = usePlaces(coupleId)
    const { data: profiles } = useProfiles(coupleId)
    const { data: wishes } = useWishes(coupleId, myId)
    const { data: visits } = useVisits(coupleId)
    const { data: reactions } = useReactions(coupleId, myId)
    useRealtimePlaces(coupleId) // 상대가 추가하면 지도/시트 즉시 갱신(여기 한 곳에서만 구독)

    const enriched = useMemo(
      () => attachAndSortWishes(places ?? [], wishes?.byPlace ?? {}, myId),
      [places, wishes, myId],
    )
    const visitedIds = useMemo(() => new Set((visits ?? []).map((v) => v.place_id)), [visits])
    const [selectedId, setSelectedId] = useState<string | null>(null)

    return (
      <ScreenScaffold title={tab.title} subtitle={tab.subtitle} testId={tab.testId}>
        <TodayCard coupleId={coupleId} />
        {isNaverMapConfigured() ? (
          <div className={styles.mapWrap}>
            {/* 검색바는 시트가 아니라 지도 위 상단 오버레이(spec §5) — peek에서도 도달, ≤3탭 보존. */}
            {coupleActive ? <MapSearchOverlay coupleId={coupleId} /> : null}
            <NaverMap
              places={enriched}
              visitedIds={visitedIds}
              profiles={profiles ?? {}}
              myId={myId}
              reactions={reactions}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onClose={() => setSelectedId(null)}
            />
          </div>
        ) : (
          <EmptyState
            emoji="🗺️"
            title="지도 준비 중이에요"
            hint="네이버 지도 키를 설정하면 여기에 우리 장소가 마커로 떠요."
          />
        )}
        <PlaceSheet
          coupleId={coupleId}
          myId={myId}
          coupleActive={coupleActive}
          places={enriched}
          wishes={wishes}
          visits={visits ?? []}
          visitedIds={visitedIds}
          profiles={profiles ?? {}}
          placesLoading={placesLoading}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </ScreenScaffold>
    )
  }
  ```
  > NOTE: `useReactions` + the NaverMap `profiles`/`myId`/`reactions` props are introduced here but `useReactions` does not exist yet and NaverMap does not yet accept them. This task adds the wiring; Tasks 9–13 add `useReactions` and the NaverMap consumers. Until then typecheck/test of MapPage will fail — that is expected and resolved within this task by stubbing the missing hook (next step).

- [ ] Stub `useReactions` so MapPage typechecks now (real implementation in Task 12 replaces the body). Create `src/hooks/useReactions.ts`:
  ```ts
  import { useQuery } from '@tanstack/react-query'
  import { isSupabaseConfigured } from '@/lib/supabase/client'

  // 리액션 집계 — place별 { count, didIReact }. 실제 구현은 P-D Task 12에서 채운다.
  export type ReactionAgg = { count: number; didIReact: boolean }
  export type ReactionMap = Record<string, ReactionAgg>

  export function useReactions(coupleId: string | null, _myId: string | null) {
    return useQuery<ReactionMap>({
      queryKey: ['reactions', coupleId],
      enabled: Boolean(coupleId && isSupabaseConfigured),
      queryFn: async () => ({}),
    })
  }
  ```

- [ ] Make NaverMap accept the new props as a no-op scaffold (real use in Tasks 9–13). Edit `src/components/map/NaverMap.tsx` — extend the signature added in Task 3:
  ```tsx
  import type { ProfileMap } from '@/hooks/useProfiles'
  import type { ReactionMap } from '@/hooks/useReactions'
  ```
  and the component signature:
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
  }: {
    places: MarkerPlace[]
    visitedIds?: Set<string>
    profiles?: ProfileMap
    myId?: string | null
    reactions?: ReactionMap
    selectedId?: string | null
    onSelect?: (id: string) => void
    onClose?: () => void
  }) {
  ```

- [ ] Update `.mapWrap` so it is a positioning context for the absolute search overlay and fills the area behind the fixed sheet. Replace `src/pages/MapPage.module.css`:
  ```css
  .mapWrap {
    position: relative;
    height: calc(100dvh - 220px);
    min-height: 60vh;
    display: flex;
  }
  ```
  (`position: relative` makes `MapSearchOverlay`'s `position: absolute` anchor to the map area; the fixed `PlaceSheet` overlays it.)

- [ ] Delete the obsolete page.
  ```
  git rm src/pages/PlacesPage.tsx src/pages/PlacesPage.module.css
  ```

- [ ] Typecheck.
  ```
  npm run typecheck
  ```
  Expected: PASS (`useReactions` stub returns `ReactionMap`; NaverMap accepts new optional props; PlacesPage gone so `tabByPath('/places')` no longer referenced anywhere).

- [ ] Run the routing + sheet tests — the `/` screen now mounts the sheet.
  ```
  npm run test -- src/__tests__/routing.test.tsx src/__tests__/placeSheet.test.tsx
  ```
  Expected: PASS — `page-map` renders with `PlaceSheet` dialog present; sheet unit tests still green. (`routing.test.tsx` renders the real `routes`, which mount MapPage inside `AppLayout` → `OfflineQueueProvider`, so PlaceSheet's `useOfflineQueue()` resolves; `placeSheet.test.tsx`'s `renderSheet` wraps PlaceSheet in `OfflineQueueProvider` directly.)

- [ ] Run the full suite + build to catch any cross-file fallout.
  ```
  npm run test
  npm run build
  ```
  Expected: all green; Vite build succeeds.

- [ ] Commit.
  ```
  git add -A
  git commit -m "$(cat <<'EOF'
feat(map): 지도+장소 통합 — MapPage 오케스트레이터에 PlaceSheet·검색 오버레이 와이어링

- 훅(usePlaces/useProfiles/useWishes/useVisits/useReactions/useRealtimePlaces) 단일 호출
- selectedId를 NaverMap·PlaceSheet가 공유, enriched/visitedIds 한 번 계산해 양쪽 전달
- MapSearchOverlay를 지도 영역 상단에 렌더(.mapWrap position:relative, spec §5 ≤3탭 보존)
- PlacesPage / PlacesPage.module.css 삭제(로직은 PlaceList/PlaceSheet/Trash로 흡수)
- useReactions 스텁 + NaverMap에 profiles/myId/reactions 선택 props(P-D에서 구현)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

## Phase P-C: marker bubble + sync

### Task 9: Pure InfoWindow HTML builders (`infoWindowHtml` + `avatarHtml` + `escapeHtml`)

**Files:**
- Create: `src/lib/places/infoWindowHtml.ts`
- Create: `src/__tests__/infoWindowHtml.test.ts`
- Modify: `src/components/map/NaverMap.tsx` (replace local `escapeHtml` with the hoisted one)
- Test: `src/__tests__/infoWindowHtml.test.ts`

Steps:

- [ ] Write the failing unit test. Create `src/__tests__/infoWindowHtml.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest'
  import { escapeHtml, infoWindowHtml } from '@/lib/places/infoWindowHtml'
  import type { PlaceRow } from '@/hooks/usePlaces'
  import type { WithWish } from '@/lib/places/wishStatus'

  const wish = { wishedByMe: true, wishedByPartner: true, bothWished: true, wishCount: 2, totalPriority: 2, maxPriority: 1 }
  const place: WithWish<PlaceRow> = {
    id: 'p1', name: '칠성"조선소', address: '속초시', region_label: '속초', lat: 38, lng: 128,
    category: '카페', kakao_place_id: 'k1', added_by: 'u1', version: 1, wish,
  }

  describe('infoWindowHtml (말풍선 HTML — 순수)', () => {
    it('escapeHtml: 따옴표/꺾쇠를 이스케이프한다', () => {
      expect(escapeHtml('a"<b>')).toBe('a&quot;&lt;b&gt;')
    })

    it('이름을 이스케이프하고 둘 다 찜 글리프(♥)+텍스트를 포함한다(색만 의존 금지)', () => {
      const html = infoWindowHtml(place, {}, 'u1', { visited: false, didIReact: false, count: 0 })
      expect(html).toContain('칠성&quot;조선소')
      expect(html).toContain('♥')
      expect(html).toContain('둘 다 찜')
    })

    it('가봤음이면 채운 별(★)+가봤음 라벨(둘 다 찜보다 우선)', () => {
      const html = infoWindowHtml(place, {}, 'u1', { visited: true, didIReact: false, count: 0 })
      expect(html).toContain('★')
      expect(html).toContain('가봤음')
    })

    it('세 액션(길찾기/가봤어요/리액션)에 data-action·data-id를 부여한다', () => {
      const html = infoWindowHtml(place, {}, 'u1', { visited: false, didIReact: false, count: 0 })
      expect(html).toContain('data-action="directions"')
      expect(html).toContain('data-action="visit"')
      expect(html).toContain('data-action="react"')
      expect(html).toContain('data-action="close"')
      expect(html).toContain('data-id="p1"')
    })

    it('내가 리액션했으면 채운 하트(❤️), 아니면 빈 하트(🤍)', () => {
      const on = infoWindowHtml(place, {}, 'u1', { visited: false, didIReact: true, count: 1 })
      const off = infoWindowHtml(place, {}, 'u1', { visited: false, didIReact: false, count: 0 })
      expect(on).toContain('❤️')
      expect(off).toContain('🤍')
    })

    it('리액션 총 개수가 1 이상이면 하트 옆에 숫자를 표시한다(spec §7 총 개수)', () => {
      const two = infoWindowHtml(place, {}, 'u1', { visited: false, didIReact: true, count: 2 })
      const zero = infoWindowHtml(place, {}, 'u1', { visited: false, didIReact: false, count: 0 })
      // 리액션 버튼 안에 하트 + 개수(2)가 함께 렌더.
      expect(two).toMatch(/❤️\s*2/)
      // 0개면 숫자를 노출하지 않는다(빈 하트만).
      expect(zero).not.toMatch(/🤍\s*0/)
    })

    it('이미 가봤음이면 가봤어요 액션은 비활성 "가봤음" 상태로 렌더한다(중복 방문 insert 방지, spec §3)', () => {
      const visited = infoWindowHtml(place, {}, 'u1', { visited: true, didIReact: false, count: 0 })
      const notVisited = infoWindowHtml(place, {}, 'u1', { visited: false, didIReact: false, count: 0 })
      // 미방문: 누를 수 있는 가봤어요 액션(data-action=visit) 노출.
      expect(notVisited).toContain('data-action="visit"')
      expect(notVisited).toContain('✅ 가봤어요')
      // 방문 후: data-action=visit 버튼은 사라지고 disabled 상태 글리프(가봤음)만.
      expect(visited).not.toContain('data-action="visit"')
      expect(visited).toContain('disabled')
      expect(visited).toContain('✅ 가봤음')
    })

    it('meta(카테고리·지역)는 해시된 클래스 안에 렌더된다(class="undefined" 회귀 방지)', () => {
      const html = infoWindowHtml(place, {}, 'u1', { visited: false, didIReact: false, count: 0 })
      expect(html).toContain('카페 · 속초')
      // CSS module .meta가 존재해 해시 클래스가 들어가야 함(class="undefined" 금지).
      expect(html).not.toContain('class="undefined"')
    })
  })
  ```

- [ ] Run the test — expect FAIL.
  ```
  npm run test -- src/__tests__/infoWindowHtml.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/lib/places/infoWindowHtml'`.

- [ ] Implement the builders. Create `src/lib/places/infoWindowHtml.ts`:
  ```ts
  import type { ProfileMap } from '@/hooks/useProfiles'
  import type { PlaceRow } from '@/hooks/usePlaces'
  import { markerVisual } from '@/lib/places/markerVisual'
  import type { WithWish } from '@/lib/places/wishStatus'
  import iwStyles from '@/components/map/InfoWindow.module.css'
  import avStyles from '@/components/common/SourceAvatar.module.css'

  // 말풍선 HTML 문자열 — 순수 함수(테스트로 못박음). naver/DOM 비의존, 사용자 텍스트는 전부 이스케이프.
  // 상태/소유자는 색+글리프+텍스트 이중화(§8). 액션 버튼은 data-action/data-id(위임 핸들러가 읽음).

  export function escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

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

  export function infoWindowHtml(
    place: WithWish<PlaceRow>,
    profiles: ProfileMap,
    myId: string | null,
    state: { visited: boolean; didIReact: boolean; count: number },
  ): string {
    const visual = markerVisual({
      visited: state.visited,
      bothWished: place.wish.bothWished,
      name: place.name,
    })
    const name = escapeHtml(place.name)
    const id = escapeHtml(place.id)
    const meta = [place.category, place.region_label]
      .filter((x): x is string => Boolean(x))
      .map((x) => escapeHtml(x))
      .join(' · ')
    const statusText =
      visual.kind === 'visited' ? '가봤음' : visual.kind === 'both' ? '둘 다 찜' : '가고싶음'
    const heart = state.didIReact ? '❤️' : '🤍'
    // ❤️ 총 개수(spec §3·§7) — 1 이상이면 하트 옆에 숫자, 0이면 숨김.
    const countLabel = state.count > 0 ? ` ${state.count}` : ''
    // 이미 가봤음이면 누를 수 있는 visit 액션 대신 비활성 "가봤음" 상태(중복 방문 insert 방지, spec §3).
    const visitAction = state.visited
      ? `<span class="${iwStyles.action} ${iwStyles.actionDone}" aria-disabled="true" data-disabled="true" disabled>✅ 가봤음</span>`
      : `<button type="button" class="${iwStyles.action}" data-action="visit" data-id="${id}" aria-label="${name} 가봤어요로 기록">✅ 가봤어요</button>`

    return [
      `<div class="${iwStyles.bubble}" role="dialog" aria-label="${name} 정보">`,
      `<button type="button" class="${iwStyles.close}" data-action="close" data-id="${id}" aria-label="닫기">✕</button>`,
      `<div class="${iwStyles.head}">`,
      `<span class="${iwStyles.glyph}" aria-hidden>${visual.glyph}</span>`,
      `<span class="${iwStyles.name}">${name}</span>`,
      `</div>`,
      `<div class="${iwStyles.sub}">`,
      `<span class="${iwStyles.status}">${escapeHtml(statusText)}</span>`,
      meta ? `<span class="${iwStyles.meta}">${meta}</span>` : '',
      avatarHtml(place.added_by, profiles, myId),
      `</div>`,
      `<div class="${iwStyles.actions}">`,
      `<button type="button" class="${iwStyles.action}" data-action="directions" data-id="${id}" aria-label="${name} 길찾기">🧭 길찾기</button>`,
      visitAction,
      `<button type="button" class="${iwStyles.action}" data-action="react" data-id="${id}" aria-label="${name} 하트 리액션 (총 ${state.count}개)">${heart}${countLabel}</button>`,
      `</div>`,
      `</div>`,
    ].join('')
  }
  ```

- [ ] Create the InfoWindow CSS module (hashed class names interpolated into the HTML string). Create `src/components/map/InfoWindow.module.css`:
  ```css
  .bubble {
    background: var(--c-surface);
    color: var(--c-text);
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    padding: var(--sp-3);
    min-width: 200px;
    max-width: 260px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    position: relative;
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

  .head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding-right: var(--sp-6);
  }

  .glyph {
    font-size: 1.1rem;
    color: var(--c-brand);
  }

  .name {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sub {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-top: var(--sp-1);
    font-size: var(--fs-caption);
    color: var(--c-text-weak);
    flex-wrap: wrap;
  }

  .status {
    font-weight: 600;
    color: var(--c-brand);
  }

  /* 카테고리·지역 메타 — 한 줄 말줄임(class="undefined" 회귀 방지: 이 클래스가 반드시 존재해야 함). */
  .meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    gap: var(--sp-2);
    margin-top: var(--sp-3);
  }

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

  /* 이미 가봤음 — 비활성 상태(누를 수 없음, 중복 방문 방지). 색+텍스트로 상태 표시(§8). */
  .actionDone {
    color: var(--c-success);
    font-weight: 600;
    opacity: 0.7;
    cursor: default;
  }
  ```

- [ ] Hoist `escapeHtml` in NaverMap to the shared one. Edit `src/components/map/NaverMap.tsx`:
  - Add import:
    ```tsx
    import { escapeHtml } from '@/lib/places/infoWindowHtml'
    ```
  - Delete the local `function escapeHtml(s: string): string { ... }` definition (lines 28–34 region).

- [ ] Run the test — expect PASS.
  ```
  npm run test -- src/__tests__/infoWindowHtml.test.ts
  ```
  Expected: all 8 cases green (escape, glyph priority, data-action, heart toggle, reaction count, visited-state visit action, meta hashed class).

- [ ] Typecheck.
  ```
  npm run typecheck
  ```
  Expected: PASS (NaverMap still compiles using the imported `escapeHtml`).

- [ ] Commit.
  ```
  git add src/lib/places/infoWindowHtml.ts src/components/map/InfoWindow.module.css src/components/map/NaverMap.tsx src/__tests__/infoWindowHtml.test.ts
  git commit -m "$(cat <<'EOF'
feat(map): 말풍선 HTML 빌더 infoWindowHtml + avatarHtml(순수)

- 상태 글리프(☆/♥/★)+텍스트 이중화, data-action/data-id 액션 3개+닫기
- ❤️ 리액션 버튼에 총 개수 표시(spec §3·§7), 이미 가봤음이면 visit 액션을 비활성 "가봤음"으로(중복 방문 방지, spec §3)
- 사용자 텍스트 전부 escapeHtml, NaverMap의 escapeHtml을 공용으로 호이스트
- InfoWindow.module.css(.meta/.actionDone 포함, 해시 클래스 문자열 보간), SourceAvatar 색/이니셜 재현
- 단위 테스트(이스케이프·글리프 우선순위·data-action·하트 토글·개수·가봤음 상태·meta 클래스)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

### Task 10: Marker click → select + highlight (icon swap, no fitBounds re-run)

**Files:**
- Modify: `src/components/map/NaverMap.tsx` (markers Map<id,marker> + click listeners + highlight effect)
- Create: `src/lib/places/selectedMarker.ts`
- Create: `src/__tests__/selectedMarker.test.ts`
- Test: `src/__tests__/selectedMarker.test.ts`

Steps:

- [ ] Write the failing unit test for the pure highlight-class helper. Create `src/__tests__/selectedMarker.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest'
  import { markerIconHtml, SELECTED_ZINDEX, BASE_ZINDEX } from '@/lib/places/selectedMarker'

  describe('selectedMarker (선택 마커 강조 — 순수)', () => {
    it('선택되지 않은 마커는 selected 클래스/링이 없다', () => {
      const html = markerIconHtml({ glyph: '☆', pinClass: 'pin', label: '카페 — 가고싶음', selected: false })
      expect(html).toContain('☆')
      expect(html).toContain('카페 — 가고싶음')
      expect(html).not.toContain('selected')
    })

    it('선택된 마커는 selected 수식 클래스를 포함한다(확대+링)', () => {
      const html = markerIconHtml({ glyph: '♥', pinClass: 'pin pinBoth', label: '카페 — 둘 다 찜', selected: true })
      expect(html).toContain('selected')
    })

    it('라벨의 따옴표는 이스케이프된다', () => {
      const html = markerIconHtml({ glyph: '★', pinClass: 'pin', label: '카"페', selected: false })
      expect(html).toContain('카&quot;페')
    })

    it('선택 zIndex는 기본보다 크다(앞으로 끌어올림)', () => {
      expect(SELECTED_ZINDEX).toBeGreaterThan(BASE_ZINDEX)
    })
  })
  ```

- [ ] Run the test — expect FAIL.
  ```
  npm run test -- src/__tests__/selectedMarker.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/lib/places/selectedMarker'`.

- [ ] Implement the helper. Create `src/lib/places/selectedMarker.ts`:
  ```ts
  import { escapeHtml } from '@/lib/places/infoWindowHtml'
  import pin from '@/components/map/NaverMap.module.css'

  // 마커 아이콘 HTML 도출(순수). 선택 시 .pinSelected 수식 클래스 추가(확대+링, §8 색+모양 이중화).
  export const BASE_ZINDEX = 1
  export const SELECTED_ZINDEX = 1000

  export function markerIconHtml(opts: {
    glyph: string
    pinClass: string
    label: string
    selected: boolean
  }): string {
    const cls = `${opts.pinClass}${opts.selected ? ` ${pin.pinSelected}` : ''}`.trim()
    return `<div class="${cls}" aria-label="${escapeHtml(opts.label)}">${opts.glyph}</div>`
  }
  ```

- [ ] Add the `.pinSelected` style. Edit `src/components/map/NaverMap.module.css` — append:
  ```css
  /* 선택 강조 — 확대 + 링(색 + 모양 이중화, §8). transform/transition만 사용(reduce-motion 자동 무력화). */
  .pinSelected {
    transform: translate(-50%, -100%) scale(1.5);
    filter: drop-shadow(0 0 0 var(--c-brand));
    text-shadow:
      0 0 0 var(--c-brand),
      0 1px 3px rgba(0, 0, 0, 0.4),
      0 0 2px #fff;
    transition: transform var(--motion-fast) var(--ease);
  }
  ```

- [ ] Rewrite the marker-drawing logic in NaverMap to keep a `Map<id, marker>`, add click listeners, and a separate highlight effect. Edit `src/components/map/NaverMap.tsx`:
  - Add refs (near `markersRef`):
    ```tsx
    const markerMapRef = useRef<Map<string, naver.maps.Marker>>(new Map())
    const listenersRef = useRef<naver.maps.MapEventListener[]>([])
    ```
  - Import the helper at top:
    ```tsx
    import { markerIconHtml, BASE_ZINDEX, SELECTED_ZINDEX } from '@/lib/places/selectedMarker'
    ```
  - Replace the marker-draw effect (the `useEffect` over `[places, ready, visitedIds]`) body so it (a) clears prior listeners, (b) builds markers into the Map, (c) attaches a click listener that calls `onSelect(p.id)`, (d) keeps the existing fitBounds-only-on-places behavior:
    ```tsx
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

      const bounds = new nv.maps.LatLngBounds(
        new nv.maps.LatLng(pts[0]!.lat!, pts[0]!.lng!),
        new nv.maps.LatLng(pts[0]!.lat!, pts[0]!.lng!),
      )

      for (const p of pts) {
        const pos = new nv.maps.LatLng(p.lat!, p.lng!)
        const visual = markerVisual({
          visited: visitedIds?.has(p.id) ?? false,
          bothWished: p.wish?.bothWished ?? false,
          name: p.name,
        })
        const modifier =
          visual.kind === 'visited' ? styles.pinVisited : visual.kind === 'both' ? styles.pinBoth : ''
        const pinClass = `${styles.pin} ${modifier}`.trim()
        const marker = new nv.maps.Marker({
          position: pos,
          map,
          title: visual.label,
          zIndex: BASE_ZINDEX,
          icon: {
            content: markerIconHtml({ glyph: visual.glyph, pinClass, label: visual.label, selected: false }),
            anchor: new nv.maps.Point(12, 24),
          },
        })
        const handle = nv.maps.Event.addListener(marker, 'click', () => onSelect?.(p.id))
        listenersRef.current.push(handle)
        markersRef.current.push(marker)
        markerMapRef.current.set(p.id, marker)
        bounds.extend(pos)
      }
      if (pts.length > 1) map.fitBounds(bounds)
      else map.setCenter(new nv.maps.LatLng(pts[0]!.lat!, pts[0]!.lng!))
    }, [places, ready, visitedIds, onSelect])
    ```
  - Update the unmount cleanup effect to also remove listeners:
    ```tsx
    return () => {
      cancelled = true
      window.naver?.maps.Event.removeListener(listenersRef.current)
      listenersRef.current = []
      markersRef.current.forEach((m) => m.setMap(null))
      markersRef.current = []
      markerMapRef.current.clear()
      mapRef.current = null
    }
    ```
  - Add a NEW highlight effect that swaps only the selected marker's icon + zIndex and `panTo`s it, WITHOUT touching fitBounds:
    ```tsx
    // 선택 강조 — 해당 마커 아이콘만 교체(확대+링)·zIndex↑·panTo. fitBounds 재실행 안 함(지도 튐 방지).
    useEffect(() => {
      const nv = window.naver
      const map = mapRef.current
      if (!ready || !nv || !map) return
      for (const [id, marker] of markerMapRef.current) {
        const p = places.find((pl) => pl.id === id)
        if (!p) continue
        const visual = markerVisual({
          visited: visitedIds?.has(id) ?? false,
          bothWished: p.wish?.bothWished ?? false,
          name: p.name,
        })
        const modifier =
          visual.kind === 'visited' ? styles.pinVisited : visual.kind === 'both' ? styles.pinBoth : ''
        const pinClass = `${styles.pin} ${modifier}`.trim()
        const selected = id === selectedId
        marker.setIcon({
          content: markerIconHtml({ glyph: visual.glyph, pinClass, label: visual.label, selected }),
          anchor: new nv.maps.Point(12, 24),
        })
        marker.setZIndex(selected ? SELECTED_ZINDEX : BASE_ZINDEX)
      }
      if (selectedId) {
        const m = markerMapRef.current.get(selectedId)
        if (m) map.panTo(m.getPosition())
      }
    }, [selectedId, places, ready, visitedIds])
    ```

- [ ] Run the test — expect PASS.
  ```
  npm run test -- src/__tests__/selectedMarker.test.ts
  ```
  Expected: all 4 cases green.

- [ ] Typecheck + build (NaverMap is jsdom-untested; build catches naver type misuse).
  ```
  npm run typecheck
  npm run build
  ```
  Expected: PASS (`setIcon`/`setZIndex`/`panTo`/`Event.addListener`/`removeListener` all match `@types/navermaps`).

- [ ] Commit.
  ```
  git add src/components/map/NaverMap.tsx src/components/map/NaverMap.module.css src/lib/places/selectedMarker.ts src/__tests__/selectedMarker.test.ts
  git commit -m "$(cat <<'EOF'
feat(map): 마커 클릭→선택·강조(아이콘 교체+zIndex↑+panTo) — fitBounds 재실행 없음

- markerMapRef(Map<id,marker>) + 클릭 리스너→onSelect(id), 리스너 cleanup 추가
- 선택 강조는 별도 effect로 해당 마커 아이콘만 교체(확대+링, §8), 지도 튐 방지
- markerIconHtml 순수 헬퍼 + .pinSelected(transform 기반, reduce-motion 자동 무력화)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

### Task 11: Single shared InfoWindow + delegated handler + sync (select/close/ESC/blank-click)

**Files:**
- Modify: `src/components/map/NaverMap.tsx` (InfoWindow ref, open/close effect, delegated click handler, map blank-click + ESC close, list-card scroll-into-view)
- Test: covered by `npm run build` + Playwright (jsdom has no naver SDK)

Steps:

- [ ] Add the InfoWindow ref + delegated-handler ref to NaverMap. Edit `src/components/map/NaverMap.tsx` — add near the other refs:
  ```tsx
  const infoRef = useRef<naver.maps.InfoWindow | null>(null)
  const infoHandlerRef = useRef<((e: MouseEvent) => void) | null>(null)
  const mapClickRef = useRef<naver.maps.MapEventListener | null>(null)
  ```
  Import the HTML builder:
  ```tsx
  import { infoWindowHtml } from '@/lib/places/infoWindowHtml'
  ```

- [ ] In the map-init effect (after `mapRef.current = new nv.maps.Map(...)` and `setReady(true)`), create the InfoWindow once and wire a map blank-click → close:
  ```tsx
  infoRef.current = new nv.maps.InfoWindow({
    content: '',
    borderWidth: 0,
    disableAnchor: false,
    backgroundColor: 'transparent',
    pixelOffset: new nv.maps.Point(0, -8),
  })
  // 지도 빈 곳 클릭 → 선택 해제(닫기).
  mapClickRef.current = nv.maps.Event.addListener(mapRef.current, 'click', () => onClose?.())
  ```
  In the unmount cleanup add:
  ```tsx
  if (mapClickRef.current) window.naver?.maps.Event.removeListener(mapClickRef.current)
  mapClickRef.current = null
  if (infoHandlerRef.current && infoRef.current) {
    infoRef.current.getContentElement()?.removeEventListener('click', infoHandlerRef.current)
  }
  infoRef.current?.close()
  infoRef.current = null
  ```
  > NOTE: the map-init effect currently has deps `[]`. `onClose` is referenced — add `onClose` would re-init the map. Instead, keep deps `[]` and read the latest `onClose` via a ref. Add `const onCloseRef = useRef(onClose); onCloseRef.current = onClose` at the top of the component and call `onCloseRef.current?.()` in the map-click listener. Apply the same ref pattern for `onSelect` in the delegated handler (next step) to avoid re-creating the map/markers unnecessarily; the marker click in Task 10 may keep `onSelect` in deps since markers rebuild anyway.

- [ ] Add the open/close + content-rebuild + delegated-handler effect (depends on `selectedId`, `places`, `visitedIds`, `reactions`, `profiles`, `myId`). Edit `src/components/map/NaverMap.tsx` — add:
  ```tsx
  // 단일 InfoWindow — selectedId/방문/리액션 변경 시 콘텐츠 재생성 후 위임 클릭 리스너 재바인딩.
  useEffect(() => {
    const nv = window.naver
    const map = mapRef.current
    const info = infoRef.current
    if (!ready || !nv || !map || !info) return

    // 이전 위임 리스너 제거(중복 바인딩 방지).
    const prevEl = info.getContentElement()
    if (prevEl && infoHandlerRef.current) prevEl.removeEventListener('click', infoHandlerRef.current)
    infoHandlerRef.current = null

    if (!selectedId) {
      info.close()
      return
    }
    const marker = markerMapRef.current.get(selectedId)
    const place = places.find((p) => p.id === selectedId)
    if (!marker || !place) {
      info.close()
      return
    }

    const html = infoWindowHtml(place, profiles ?? {}, myId ?? null, {
      visited: visitedIds?.has(selectedId) ?? false,
      didIReact: reactions?.[selectedId]?.didIReact ?? false,
      count: reactions?.[selectedId]?.count ?? 0,
    })
    info.setContent(html)
    info.open(map, marker)

    const el = info.getContentElement()
    if (el) {
      const handler = (e: MouseEvent) => {
        const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null
        if (!btn) return
        const action = btn.dataset.action
        const id = btn.dataset.id
        if (!id) return
        if (action === 'close') onCloseRef.current?.()
        else onActionRef.current?.(action ?? '', id)
      }
      el.addEventListener('click', handler)
      infoHandlerRef.current = handler
    }
  }, [selectedId, places, ready, visitedIds, reactions, profiles, myId])
  ```
  > NOTE: `onActionRef` is a ref to an optional `onAction(action, id)` prop (handling `'directions' | 'visit' | 'react'`) that MapPage passes in Task 13. For THIS task, add the prop to the NaverMap signature as OPTIONAL (`onAction?: (action: string, id: string) => void`) plus `const onActionRef = useRef(onAction); onActionRef.current = onAction`. Until Task 13 supplies it, `onAction` is `undefined`, so the three non-close actions are no-ops while Close (`onCloseRef.current?.()`) still works — the bubble opens and closes correctly. This is the deliberate phased wiring, not an unfinished stub.

- [ ] Add the `onAction` prop + refs to the signature. Edit the NaverMap component signature (extending Task 8's):
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
  And near the top of the component body:
  ```tsx
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  ```

- [ ] Add ESC-to-close (window keydown) effect. Edit `src/components/map/NaverMap.tsx` — add:
  ```tsx
  // ESC로 말풍선 닫기(EventSheet 패턴). 선택 중일 때만 바인딩.
  useEffect(() => {
    if (!selectedId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, onClose])
  ```

- [ ] Add list-card scroll-into-view sync. Edit `src/components/places/PlaceList.tsx` — give each card `<li>` a stable `id` and scroll the selected one into view. In `PlaceList.tsx`:
  - Add to imports: `import { useEffect, useRef } from 'react'`.
  - Inside the component body add:
    ```tsx
    const listRef = useRef<HTMLUListElement>(null)
    useEffect(() => {
      if (!selectedId || !listRef.current) return
      const node = listRef.current.querySelector<HTMLElement>(`[data-place-id="${selectedId}"]`)
      node?.scrollIntoView({ block: 'nearest' })
    }, [selectedId])
    ```
  - On the `<ul className={styles.list}>` add `ref={listRef}`.
  - On each `<li>` add `data-place-id={p.id}`.

- [ ] Typecheck + build.
  ```
  npm run typecheck
  npm run build
  ```
  Expected: PASS. Confirms `getContentElement()`, `setContent`, `open(map, marker)`, `InfoWindow` options, `Event.addListener`/`removeListener` types are correct.

- [ ] Run the affected unit tests (PlaceList must still pass after the `data-place-id`/scroll change).
  ```
  npm run test -- src/__tests__/placeList.test.tsx src/__tests__/infoWindowHtml.test.ts
  ```
  Expected: PASS (jsdom: `scrollIntoView` is a no-op but defined; render assertions unaffected).

- [ ] Commit.
  ```
  git add src/components/map/NaverMap.tsx src/components/places/PlaceList.tsx
  git commit -m "$(cat <<'EOF'
feat(map): 단일 InfoWindow 말풍선 + 동기화(선택/닫기/ESC/빈곳 클릭) + 리스트 스크롤

- 재사용 InfoWindow 1개, selectedId/방문/리액션 변경 시 setContent 후 위임 클릭 재바인딩
- 닫기: ✕(data-action=close)·지도 빈 곳 클릭·ESC → onClose
- onAction(action,id) 디스패처 prop(P-D 와이어링), onClose/onAction은 ref로 재초기화 방지
- 선택 카드 scrollIntoView(data-place-id)로 마커↔리스트↔말풍선 동기화

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

## Phase P-D: reactions + directions

### Task 12: `useReactions` + `useToggleReaction` + pure `aggregateReactions`

**Files:**
- Create: `src/lib/places/aggregateReactions.ts`
- Create: `src/__tests__/aggregateReactions.test.ts`
- Modify: `src/hooks/useReactions.ts` (replace the Task 8 stub with the real query + realtime + toggle)
- Test: `src/__tests__/aggregateReactions.test.ts`

Steps:

- [ ] Write the failing unit test for the pure reducer. Create `src/__tests__/aggregateReactions.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest'
  import { aggregateReactions, type ReactionRow } from '@/lib/places/aggregateReactions'

  const rows: ReactionRow[] = [
    { id: 'r1', target_id: 'p1', user_id: 'u1', emoji: '❤️', version: 1 },
    { id: 'r2', target_id: 'p1', user_id: 'u2', emoji: '❤️', version: 1 },
    { id: 'r3', target_id: 'p2', user_id: 'u2', emoji: '❤️', version: 1 },
  ]

  describe('aggregateReactions (리액션 집계 — 순수)', () => {
    it('place별 count와 내가 눌렀는지(didIReact)를 집계한다', () => {
      const agg = aggregateReactions(rows, 'u1')
      expect(agg['p1']).toEqual({ count: 2, didIReact: true })
      expect(agg['p2']).toEqual({ count: 1, didIReact: false })
    })

    it('myId가 null이면 didIReact는 전부 false', () => {
      const agg = aggregateReactions(rows, null)
      expect(agg['p1']!.didIReact).toBe(false)
      expect(agg['p2']!.didIReact).toBe(false)
    })

    it('빈 입력은 빈 맵', () => {
      expect(aggregateReactions([], 'u1')).toEqual({})
    })
  })
  ```

- [ ] Run the test — expect FAIL.
  ```
  npm run test -- src/__tests__/aggregateReactions.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/lib/places/aggregateReactions'`.

- [ ] Implement the reducer. Create `src/lib/places/aggregateReactions.ts`:
  ```ts
  // 리액션 행 → place별 집계(순수). { count, didIReact }. "누가 눌렀나" 도출(ux §2).
  export type ReactionRow = {
    id: string
    target_id: string
    user_id: string
    emoji: string
    version: number
  }
  export type ReactionAgg = { count: number; didIReact: boolean }
  export type ReactionMap = Record<string, ReactionAgg>

  export function aggregateReactions(rows: ReactionRow[], myId: string | null): ReactionMap {
    const map: ReactionMap = {}
    for (const r of rows) {
      const cur = map[r.target_id] ?? { count: 0, didIReact: false }
      cur.count += 1
      if (myId != null && r.user_id === myId) cur.didIReact = true
      map[r.target_id] = cur
    }
    return map
  }
  ```

- [ ] Run the test — expect PASS.
  ```
  npm run test -- src/__tests__/aggregateReactions.test.ts
  ```
  Expected: all 3 cases green.

- [ ] Replace the `useReactions` stub with the real hook + toggle. Replace the full contents of `src/hooks/useReactions.ts`:
  ```ts
  import { useEffect } from 'react'
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
  import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
  import {
    aggregateReactions,
    type ReactionRow,
    type ReactionMap,
    type ReactionAgg,
  } from '@/lib/places/aggregateReactions'

  // ❤️ 리액션 — "누가 눌렀나"(개인 의도). 읽기는 커플 전체(상대 것 포함), 쓰기는 본인만(0009 RLS).
  // 켜기=insert, 끄기=soft-delete(deleted_at). 물리삭제 금지(rule §4). 키 ['reactions', coupleId].
  export type { ReactionMap, ReactionAgg }

  export function useReactions(coupleId: string | null, myId: string | null) {
    const queryClient = useQueryClient()

    const query = useQuery<ReactionMap>({
      queryKey: ['reactions', coupleId],
      enabled: Boolean(coupleId && isSupabaseConfigured),
      queryFn: async () => {
        if (!coupleId) return {}
        const { data, error } = await supabase
          .from('reactions')
          .select('id, target_id, user_id, emoji, version')
          .eq('couple_id', coupleId)
          .eq('target_type', 'PLACE')
          .is('deleted_at', null)
        if (error) throw new Error(error.message)
        return aggregateReactions((data ?? []) as ReactionRow[], myId)
      },
    })

    useEffect(() => {
      if (!coupleId || !isSupabaseConfigured) return
      const channel = supabase
        .channel(`reactions:${coupleId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'reactions', filter: `couple_id=eq.${coupleId}` },
          () => queryClient.invalidateQueries({ queryKey: ['reactions', coupleId] }),
        )
        .subscribe()
      return () => {
        void supabase.removeChannel(channel)
      }
    }, [coupleId, queryClient])

    return query
  }

  // ❤️ 토글 — 내 살아있는 리액션이 없으면 insert, 있으면 soft-delete(본인 행만 — reactions_update).
  export function useToggleReaction(coupleId: string | null, myId: string | null) {
    const queryClient = useQueryClient()
    return useMutation<void, Error, { placeId: string }>({
      mutationFn: async ({ placeId }) => {
        if (!coupleId || !myId) throw new Error('먼저 상대와 연결해 주세요.')
        // stale-cache race 회피 — mutationFn에서 내 살아있는 리액션을 직접 조회.
        const { data: mine, error: selErr } = await supabase
          .from('reactions')
          .select('id')
          .eq('couple_id', coupleId)
          .eq('target_type', 'PLACE')
          .eq('target_id', placeId)
          .eq('user_id', myId)
          .is('deleted_at', null)
          .limit(1)
        if (selErr) throw new Error(selErr.message)
        const existing = mine?.[0]?.id
        if (existing) {
          const { error } = await supabase
            .from('reactions')
            .update({ deleted_at: new Date().toISOString(), updated_by: myId })
            .eq('id', existing)
          if (error) throw new Error(error.message)
        } else {
          const { error } = await supabase.from('reactions').insert({
            couple_id: coupleId,
            user_id: myId,
            target_type: 'PLACE',
            target_id: placeId,
            emoji: '❤️',
            created_by: myId,
            updated_by: myId,
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

- [ ] Typecheck — MapPage's `useReactions(coupleId, myId)` and NaverMap's `reactions?: ReactionMap` must still align (the real `ReactionMap` is now re-exported from the hook).
  ```
  npm run typecheck
  ```
  Expected: PASS.

- [ ] Run the full suite.
  ```
  npm run test
  ```
  Expected: all green.

- [ ] Commit.
  ```
  git add src/lib/places/aggregateReactions.ts src/hooks/useReactions.ts src/__tests__/aggregateReactions.test.ts
  git commit -m "$(cat <<'EOF'
feat(reactions): useReactions/useToggleReaction + aggregateReactions(순수)

- target_type=PLACE·deleted_at IS NULL 집계(count·didIReact), realtime 'reactions:<coupleId>'
- 토글: 내 살아있는 행 없으면 insert(❤️), 있으면 soft-delete(본인 행만, 0009 RLS)
- 순수 reducer 단위 테스트(집계·myId null·빈 입력)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

### Task 13: `directionsUrl` + wire bubble actions (directions / visit / react)

**Files:**
- Create: `src/lib/places/directionsUrl.ts`
- Create: `src/__tests__/directionsUrl.test.ts`
- Modify: `src/pages/MapPage.tsx` (add `onAction` dispatcher passing to NaverMap)
- Modify: `src/components/map/NaverMap.tsx` (rebuild InfoWindow content on reaction/visited change — already in deps; confirm)
- Test: `src/__tests__/directionsUrl.test.ts`

Steps:

- [ ] Write the failing unit test. Create `src/__tests__/directionsUrl.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest'
  import { directionsUrl, directionsWebUrl } from '@/lib/places/directionsUrl'

  describe('directionsUrl (네이버 길찾기 딥링크 — 순수)', () => {
    it('앱 스킴 nmap://route/public에 좌표/이름/appname을 인코딩한다', () => {
      const url = directionsUrl({ lat: 37.5, lng: 127.0, name: '칠성 조선소' })
      expect(url.startsWith('nmap://route/public?')).toBe(true)
      expect(url).toContain('dlat=37.5')
      expect(url).toContain('dlng=127')
      expect(url).toContain('dname=%EC%B9%A0%EC%84%B1%20%EC%A1%B0%EC%84%A0%EC%86%8C')
      expect(url).toContain('appname=')
    })

    it('웹 폴백은 https://map.naver.com에 목적지 좌표/이름을 싣는다', () => {
      const url = directionsWebUrl({ lat: 37.5, lng: 127.0, name: '카페' })
      expect(url.startsWith('https://map.naver.com/')).toBe(true)
      expect(url).toContain('37.5')
      expect(url).toContain('127')
    })

    it('이름의 특수문자(&,",공백)는 인코딩된다', () => {
      const url = directionsUrl({ lat: 1, lng: 2, name: 'a&b "c"' })
      expect(url).toContain(encodeURIComponent('a&b "c"'))
    })
  })
  ```

- [ ] Run the test — expect FAIL.
  ```
  npm run test -- src/__tests__/directionsUrl.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/lib/places/directionsUrl'`.

- [ ] Implement the pure URL builders. Create `src/lib/places/directionsUrl.ts`:
  ```ts
  // 네이버 길찾기 딥링크(순수) — 키/백엔드 불필요. 앱 스킴 + https 웹 폴백.
  // 정확한 스킴/파라미터는 실기기(모바일 Safari)에서 verify 후 고정(spec §13 열린 항목).
  const APPNAME = 'place.lovemap'

  export type DirTarget = { lat: number; lng: number; name: string }

  // 네이버 지도 앱 스킴 — 목적지(d*) 좌표/이름 + appname(복귀용).
  // 쿼리는 직접 인코딩한다(URLSearchParams는 공백을 '+'로 인코딩하지만 앱 스킴 dname은 %20 기대).
  export function directionsUrl({ lat, lng, name }: DirTarget): string {
    const dname = encodeURIComponent(name)
    const appname = encodeURIComponent(APPNAME)
    return `nmap://route/public?dlat=${lat}&dlng=${lng}&dname=${dname}&appname=${appname}`
  }

  // 웹 폴백 — 앱 미설치 시 브라우저로. 목적지 좌표/이름을 경로 세그먼트에.
  export function directionsWebUrl({ lat, lng, name }: DirTarget): string {
    return `https://map.naver.com/p/directions/-/-/${lng},${lat},${encodeURIComponent(name)}/-/transit`
  }

  // 앱 스킴 시도 → 일정 시간 내 미전환이면 웹 폴백으로(브라우저 환경에서만 호출).
  export function openDirections(target: DirTarget): void {
    if (typeof window === 'undefined') return
    const app = directionsUrl(target)
    const web = directionsWebUrl(target)
    const fallback = window.setTimeout(() => {
      window.location.href = web
    }, 1200)
    window.location.href = app
    // 앱으로 전환되면 페이지가 백그라운드 → pagehide로 폴백 타이머 취소.
    window.addEventListener(
      'pagehide',
      () => window.clearTimeout(fallback),
      { once: true },
    )
  }
  ```

- [ ] Run the test — expect PASS.
  ```
  npm run test -- src/__tests__/directionsUrl.test.ts
  ```
  Expected: all 3 cases green (`%20` in `dname`, https web fallback, special-char encoding).

- [ ] Wire the `onAction` dispatcher in MapPage. Edit `src/pages/MapPage.tsx`:
  - Add imports:
    ```tsx
    import { useToggleReaction } from '@/hooks/useReactions'
    import { useMarkVisited } from '@/hooks/useVisits'
    import { openDirections } from '@/lib/places/directionsUrl'
    ```
  - In the component body (after `enriched`/`visitedIds`):
    ```tsx
    const toggleReaction = useToggleReaction(coupleId, myId)
    const markVisited = useMarkVisited(coupleId, myId)
    const onAction = (action: string, id: string) => {
      const p = enriched.find((pl) => pl.id === id)
      if (action === 'directions') {
        if (p && typeof p.lat === 'number' && typeof p.lng === 'number') {
          openDirections({ lat: p.lat, lng: p.lng, name: p.name })
        }
      } else if (action === 'visit') {
        // 이미 가봤음이면 중복 방문 insert 금지(spec §3 원탭 1건). 말풍선도 비활성 상태로 렌더되지만 이중 가드.
        if (!visitedIds.has(id)) markVisited.mutate({ placeId: id })
      } else if (action === 'react') {
        toggleReaction.mutate({ placeId: id })
      }
    }
    ```
  - Pass it to `<NaverMap ... onAction={onAction} />`.

- [ ] Confirm the InfoWindow content rebuilds on reaction/visited change. The open/close effect in Task 11 already lists `visitedIds` and `reactions` in its dependency array, so a successful `markVisited`/`toggleReaction` → query invalidate → new `visitedIds`/`reactions` props → effect re-runs → `setContent` with the updated heart/✅. No code change needed here; verify by reading the effect deps.

- [ ] Typecheck + build.
  ```
  npm run typecheck
  npm run build
  ```
  Expected: PASS.

- [ ] Run the full suite.
  ```
  npm run test
  ```
  Expected: all green.

- [ ] Commit.
  ```
  git add src/lib/places/directionsUrl.ts src/pages/MapPage.tsx src/__tests__/directionsUrl.test.ts
  git commit -m "$(cat <<'EOF'
feat(map): 말풍선 액션 와이어링 — 🧭 길찾기 · ✅ 가봤어요 · ❤️ 리액션

- directionsUrl(순수): nmap:// 앱 스킴 + https map.naver.com 폴백, openDirections 전환
- MapPage onAction 디스패처: directions→openDirections, visit→useMarkVisited(visitedIds 가드로 중복 방문 차단), react→useToggleReaction
- 방문/리액션 변경 시 InfoWindow content 재생성(effect deps에 visitedIds/reactions, count 반영)
- directionsUrl 단위 테스트(스킴/폴백/인코딩)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

### Task 14: RLS integration cases for PLACE reactions

**Files:**
- Modify: `src/__tests__/rls.integration.test.ts` (add 4 cases inside the existing `describe.skipIf(!ready)` block)
- Test: `src/__tests__/rls.integration.test.ts`

Steps:

- [ ] Add the PLACE-reaction RLS cases. Edit `src/__tests__/rls.integration.test.ts` — add these 4 `it(...)` blocks INSIDE the existing `describe.skipIf(!ready)('RLS 커플 격리 (라이브 통합)', ...)` block (after the existing reactions UPDATE case):
  ```ts
  it('A는 B 커플의 reactions(PLACE)를 못 본다 (교차 SELECT 0건)', async () => {
    const { data: bR } = await cb
      .from('reactions')
      .select('id')
      .eq('target_type', 'PLACE')
      .is('deleted_at', null)
      .limit(1)
    const someBR = bR?.[0]?.id
    if (!someBR) {
      expect(true).toBe(true)
      return
    }
    const { data: leaked } = await ca.from('reactions').select('id').eq('id', someBR)
    expect(leaked ?? []).toHaveLength(0)
  })

  it('A는 자기 커플 장소에 PLACE 리액션을 본인 명의로 추가할 수 있다', async () => {
    const { data: aCouple } = await ca.rpc('current_couple_id')
    const { data: aPlaces } = await ca.from('places').select('id').limit(1)
    const placeId = aPlaces?.[0]?.id
    if (!placeId) {
      expect(true).toBe(true)
      return
    }
    const { data: inserted, error } = await ca
      .from('reactions')
      .insert({
        couple_id: aCouple,
        user_id: aUserId,
        target_type: 'PLACE',
        target_id: placeId,
        emoji: '❤️',
        created_by: aUserId,
        updated_by: aUserId,
      })
      .select('id')
    expect(error).toBeNull()
    // 정리 — 방금 넣은 리액션 soft-delete(테스트 격리 유지).
    const newId = inserted?.[0]?.id
    if (newId) {
      await ca
        .from('reactions')
        .update({ deleted_at: new Date().toISOString(), updated_by: aUserId })
        .eq('id', newId)
    }
  })

  it('A는 user_id를 위조해 PLACE 리액션을 만들 수 없다 (WITH CHECK 거부)', async () => {
    const { data: aCouple } = await ca.rpc('current_couple_id')
    const { data: aPlaces } = await ca.from('places').select('id').limit(1)
    const placeId = aPlaces?.[0]?.id
    if (!placeId) {
      expect(true).toBe(true)
      return
    }
    const fakeUser = '00000000-0000-0000-0000-000000000000'
    const { error } = await ca.from('reactions').insert({
      couple_id: aCouple,
      user_id: fakeUser,
      target_type: 'PLACE',
      target_id: placeId,
      emoji: '❤️',
      created_by: aUserId,
      updated_by: aUserId,
    })
    expect(error).not.toBeNull()
  })

  it('A는 couple_id를 B로 위조해 PLACE 리액션을 만들 수 없다 (WITH CHECK 거부)', async () => {
    const { data: bCouple } = await cb.rpc('current_couple_id')
    const { data: bPlaces } = await cb.from('places').select('id').limit(1)
    const placeId = bPlaces?.[0]?.id
    if (!placeId) {
      expect(true).toBe(true)
      return
    }
    const { error } = await ca.from('reactions').insert({
      couple_id: bCouple,
      user_id: aUserId,
      target_type: 'PLACE',
      target_id: placeId,
      emoji: '❤️',
      created_by: aUserId,
      updated_by: aUserId,
    })
    expect(error).not.toBeNull()
  })
  ```

- [ ] Run the test — expect PASS (skipped locally without RLS env vars).
  ```
  npm run test -- src/__tests__/rls.integration.test.ts
  ```
  Expected: `describe.skipIf(!ready)` skips the whole block when the 6 `RLS_TEST_*` env vars are absent → green/skipped. (When live creds are provisioned per `docs/rls-testing.md`, all 4 new cases run with the seed-guard idiom.)

- [ ] Typecheck.
  ```
  npm run typecheck
  ```
  Expected: PASS.

- [ ] Commit.
  ```
  git add src/__tests__/rls.integration.test.ts
  git commit -m "$(cat <<'EOF'
test(rls): PLACE 리액션 커플 격리 케이스 보강(0009 RLS)

- 교차 SELECT 0건, 본인 명의 insert 성공(+정리), user_id/couple_id 위조 거부
- 기존 describe.skipIf(!ready) 블록에 추가(env 게이트·세션·seed-guard 재사용)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

### Task 15: Playwright visual smoke for the unified screen + final gate

**Files:**
- Modify: `e2e/smoke.spec.ts` (add a `/places` → `/auth` redirect-while-logged-out assertion; keep login smoke)
- Test: `e2e/smoke.spec.ts` + all gates

Steps:

- [ ] Add a smoke assertion that `/places` no longer 404s and resolves through the router. Edit `e2e/smoke.spec.ts` — append:
  ```ts
  test('통합 후 /places는 (비로그인 시) 로그인으로 수렴한다', async ({ page }) => {
    await page.goto('/places')
    await expect(page).toHaveURL((url) => url.pathname === '/auth')
  })
  ```
  > NOTE: e2e runs with a key-less build → all protected routes (including `/` and `/places`) redirect to `/auth` (existing smoke convention). The authenticated unified screen (map + sheet + bubble) is verified by vitest component/unit tests above, not e2e, since login is required and out of e2e scope.

- [ ] Run the e2e smoke.
  ```
  npm run e2e
  ```
  Expected: all smoke tests pass (`/`, `/auth`, `/nope`, and the new `/places` → `/auth`). Screenshot baseline comparison is skipped unless a same-platform baseline exists.

- [ ] Run the complete gate set (typecheck + unit + build).
  ```
  npm run typecheck
  npm run test
  npm run build
  ```
  Expected: `tsc` 0 errors; all vitest suites green (routing, placeList, trashSection, placeSheet, mapSearchOverlay, sheetSnap, infoWindowHtml, selectedMarker, aggregateReactions, directionsUrl, rls.integration skipped, markerVisual unchanged); Vite production build succeeds.

- [ ] Commit.
  ```
  git add e2e/smoke.spec.ts
  git commit -m "$(cat <<'EOF'
test(e2e): 통합 화면 — /places 리다이렉트 스모크 + 최종 게이트 통과

- 비로그인 /places → /auth 수렴 확인(라우트 통합 회귀 방지)
- typecheck/vitest/build/e2e 4게이트 통과 확인

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

---

## Done criteria (all gates green)

- `npm run typecheck` → 0 errors.
- `npm run test` → all vitest suites pass (RLS integration skipped without live creds).
- `npm run build` → Vite production build succeeds.
- `npm run e2e` → Playwright smoke passes.
- 4-tab IA live (지도/일정/추천/우리); `/places` redirects to `/`; the unified 지도 screen shows map + top search overlay (PlaceSearch, ≤3-tap save preserved) + draggable sheet whose peek header shows handle/summary/filter chips and whose body holds list/trips/trash; selecting a marker/card at peek bumps the sheet to half; marker click highlights + opens InfoWindow with working 🧭 길찾기 / ✅ 가봤어요 (disabled "가봤음" once visited, no duplicate insert) / ❤️ react showing the total reaction count + close (✕/blank-click/ESC); list↔marker↔bubble stay in sync via `selectedId`; reactions sync over realtime; color+shape dual-coding, reduced-motion, and empty/loading/error states preserved throughout.
