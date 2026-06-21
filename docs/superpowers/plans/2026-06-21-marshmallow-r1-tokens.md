# 마시멜로 R1 — 토큰 기반공사 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `tokens.css`를 마시멜로 팔레트로 교체하되 **별칭 레이어**로 기존 `--c-*`/`--radius*` 호출부(353회)를 그대로 둔 채 전 화면 색을 즉시 마시멜로로 바꾼다. 동시에 WCAG 조건부 대비 게이트, 핑크틴트 그림자 3단계·반경 6단계·pink/yellow/시맨틱 스케일 신설, 가중치 700/800 정리→폰트 self-host, 그라데이션 셰이머 제거, 다크 분기 마시멜로 잠정값 교체(평탄화 금지), 데드 토큰 정리.

**Architecture:** 마시멜로 평면 토큰(`--bg --ink* --pink* --yellow* --mint* --lavender* --like --ok* --danger* --shadow-* --focus-ring --r-*`)을 1급으로 정의하고, 기존 `--c-*`/`--radius`/`--radius-sm`를 그 위에 매핑하는 **호환 별칭 레이어**를 둔다(R7에서 삭제). 다크는 1급 토큰을 override → 별칭이 자동 추종. 대비는 순수 함수 유틸 + tokens.css를 파싱하는 게이트 테스트로 못박는다.

**Tech Stack:** CSS custom properties(tokens.css 단일소스), vitest, pretendard·@fontsource/quicksand(self-host), Playwright(라이트+다크 스냅샷).

**전제(설계 spec):** `docs/superpowers/specs/2026-06-21-marshmallow-design-adoption.md`. 충돌 시 spec 우선.

---

## File Structure

**새로 만들 파일**
- `src/lib/a11y/contrast.ts` — WCAG 상대휘도·대비비·AA 판정 순수 함수.
- `src/__tests__/contrast.test.ts` — 유틸 단위 테스트(알려진 값 + 핵심 색쌍).
- `src/__tests__/tokensContrast.test.ts` — tokens.css를 파싱해 라이트/다크 토큰값의 조건부 대비를 단언(게이트).

**수정할 파일**
- `src/styles/tokens.css` — 마시멜로 1급 토큰 + 별칭 레이어 + 다크 교체 + 데드 토큰 정리 + 폰트 스택.
- `src/main.tsx` — self-host 폰트 CSS import.
- `package.json` — `pretendard`, `@fontsource/quicksand` 의존성.
- 가중치 700/800 사용 ~14곳(`grep`으로 특정) — 600 이하로.
- `src/components/common/Skeleton.module.css`, `src/components/common/RouteFallback.module.css`(또는 실제 셰이머 위치) — 그라데이션 셰이머 제거.
- e2e 스냅샷 베이스라인(라이트/다크) — 재생성.

**사용자 자산(에이전트 비대상)**
- Cafe24 Ssurround `.woff2`를 `public/fonts/`에 투입(OFL, cafe24 배포본 → woff2 변환). 없으면 디스플레이는 Quicksand+Pretendard로 우아하게 폴백.

---

## Task 1: WCAG 대비 유틸 + 단위 테스트

**Files:** Create `src/lib/a11y/contrast.ts`, `src/__tests__/contrast.test.ts`

- [ ] **Step 1: 실패 테스트** — `src/__tests__/contrast.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { contrastRatio, meetsAA } from '@/lib/a11y/contrast'

describe('WCAG 대비 유틸', () => {
  it('검정/흰색 = 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })
  it('같은 색 = 1:1', () => {
    expect(contrastRatio('#FF93AC', '#FF93AC')).toBeCloseTo(1, 1)
  })
  it('주요버튼 pink-400 + 자두텍스트는 본문 AA 통과(≈5.75:1)', () => {
    const r = contrastRatio('#FF93AC', '#5A2438')
    expect(r).toBeGreaterThanOrEqual(4.5)
  })
  it('본문 잉크 on white는 AA 통과(≈7.7:1)', () => {
    expect(contrastRatio('#6B4A52', '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })
  it('meetsAA: 본문 4.5 / 큰글씨 3.0 분기', () => {
    expect(meetsAA(4.6, { large: false })).toBe(true)
    expect(meetsAA(3.2, { large: false })).toBe(false)
    expect(meetsAA(3.2, { large: true })).toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/__tests__/contrast.test.ts` → FAIL(모듈 없음).

- [ ] **Step 3: 구현** — `src/lib/a11y/contrast.ts`

```ts
// WCAG 2.1 상대휘도·대비비(순수). 색은 #rrggbb 가정.
function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

// 본문 4.5:1, 큰 글씨(≥24px 또는 ≥18.66px+600)·UI 3:1.
export function meetsAA(ratio: number, opts: { large: boolean }): boolean {
  return ratio >= (opts.large ? 3 : 4.5)
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/__tests__/contrast.test.ts && npm run typecheck` → PASS, tsc 0.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/a11y/contrast.ts src/__tests__/contrast.test.ts
git commit -m "feat(a11y): WCAG 대비비 유틸 + 단위 테스트(조건부 AA 게이트 토대)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 마시멜로 토큰 + 별칭 레이어 + 다크 교체 + 토큰 대비 게이트

**Files:** Modify `src/styles/tokens.css`; Create `src/__tests__/tokensContrast.test.ts`

- [ ] **Step 1: 토큰 대비 게이트 테스트(실패)** — `src/__tests__/tokensContrast.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { contrastRatio, meetsAA } from '@/lib/a11y/contrast'

// tokens.css를 파싱해 라이트/다크 토큰 hex를 추출한다(소스 진실을 직접 게이트).
const css = readFileSync(fileURLToPath(new URL('../styles/tokens.css', import.meta.url)), 'utf8')
function extract(scope: string): Record<string, string> {
  const m: Record<string, string> = {}
  for (const line of scope.split('\n')) {
    const hit = line.match(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/)
    if (hit) m[hit[1]!] = hit[2]!
  }
  return m
}
const lightScope = css.slice(css.indexOf(':root'), css.indexOf('@media (prefers-color-scheme: dark)'))
const darkScope = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'))
const light = extract(lightScope)
const dark = { ...light, ...extract(darkScope) } // 다크는 라이트 위 override

describe('tokens.css 조건부 대비 게이트(WCAG AA)', () => {
  // 본문 텍스트(4.5:1): ink on surface / bg
  it('라이트: --ink on --surface, --bg 본문 통과', () => {
    expect(meetsAA(contrastRatio(light['--ink']!, light['--surface']!), { large: false })).toBe(true)
    expect(meetsAA(contrastRatio(light['--ink']!, light['--bg']!), { large: false })).toBe(true)
  })
  it('라이트: --ink-muted on --surface 본문 통과(보정값)', () => {
    expect(meetsAA(contrastRatio(light['--ink-muted']!, light['--surface']!), { large: false })).toBe(true)
  })
  it('라이트: 주요버튼 --pink-400 + 자두(#5A2438) 본문 통과', () => {
    expect(meetsAA(contrastRatio(light['--pink-400']!, '#5A2438'), { large: false })).toBe(true)
  })
  it('라이트: --pink-ink on --pink-100 본문 통과', () => {
    expect(meetsAA(contrastRatio(light['--pink-ink']!, light['--pink-100']!), { large: false })).toBe(true)
  })
  it('다크: --ink on --surface 본문 통과(평탄화 아님 — 라이트와 다른 값)', () => {
    expect(dark['--surface']).not.toBe(light['--surface']) // 다크=라이트 평탄화 금지
    expect(meetsAA(contrastRatio(dark['--ink']!, dark['--surface']!), { large: false })).toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/__tests__/tokensContrast.test.ts` → FAIL(현재 토큰은 테라코타·`--ink` 없음).

- [ ] **Step 3: tokens.css `:root` 블록 교체** — 기존 `:root { ... }`(8–74행)의 **색/그림자/반경 토큰을** 아래로 교체(폰트/간격/safe-area/레이아웃/모션 토큰은 보존하되 `--font-sans`만 교체, `--sp-5`는 Task에서 별도 처리):

```css
:root {
  color-scheme: light dark;

  /* ── 마시멜로 1급 토큰(정본) ── */
  /* 표면 */
  --bg: #fff1f4;
  --surface: #ffffff;
  --surface-soft: #fff7f3;
  /* 잉크(검정 금지·자두). ink-muted는 대비 보정값, ink-faint는 텍스트 금지(구분선/장식만) */
  --ink: #6b4a52;
  --ink-muted: #8e6b74;
  --ink-faint: #c9b2b8;
  /* 라인 */
  --line: #fad9e0;
  --line-strong: #f3c4d0;
  /* 핑크(브랜드) */
  --pink-100: #ffe0e8;
  --pink-200: #ffc9d6;
  --pink-400: #ff93ac;
  --pink-600: #e2638a;
  --pink-ink: #b23a60;
  /* 옐로(액센트) */
  --yellow-100: #fff0c2;
  --yellow-300: #ffd86b;
  --yellow-ink: #9a7a1e;
  /* 아바타페어(트랙·프로필 4색의 채도 버전) */
  --mint: #dcf1ea;
  --mint-ink: #2f7d62;       /* ok 민트(#4FB58A)와 명도 분리 — 더 진하게 */
  --lavender: #ece4fb;
  --lavender-ink: #6e5aa8;
  /* 좋아요(텍스트 색 금지 — 형태 이중화 전용) */
  --like: #ff7c97;
  /* 시맨틱(소프트 + ink) */
  --ok: #4fb58a; --ok-soft: #def3ea; --ok-ink: #2e7a5c;
  --danger: #e06b6b; --danger-soft: #fbe4e2; --danger-ink: #b23a3a;
  /* 그림자(핑크틴트 3단계 — 회색/검정 금지) */
  --shadow-raised: 0 2px 10px rgba(255, 150, 180, 0.10);
  --shadow-floating: 0 10px 28px rgba(255, 150, 180, 0.18);
  --focus-ring: 0 0 0 3px rgba(255, 150, 180, 0.28);
  /* 반경 6단계(마시멜로 --r-* — 기존 --radius/--radius-sm와 충돌 없음) */
  --r-xs: 8px; --r-sm: 12px; --r-md: 14px; --r-lg: 20px; --r-xl: 28px; --r-pill: 999px;

  /* ── 호환 별칭(마이그레이션 동안만 — R7에서 삭제) ── */
  --c-bg: var(--bg);
  --c-surface: var(--surface);
  --c-surface-2: var(--surface-soft);
  --c-text: var(--ink);
  --c-text-weak: var(--ink-muted);
  --c-border: var(--line);
  --c-brand: var(--pink-600);
  --c-brand-weak: var(--pink-200);
  --c-cta-bg: var(--pink-600);
  --c-cta-fg: #ffffff; /* pink-600+흰글자=3.29:1 → 큰 CTA 버튼 전용(spec §5) */
  --c-danger: var(--danger);
  --c-success: var(--ok);
  /* 캘린더 3트랙 = 아바타페어로 매핑(런타임 도출 규칙 불변, 팔레트만 교체) */
  --c-track-mine: var(--mint-ink);     /* 나 = 민트 */
  --c-track-partner: var(--pink-600);  /* 상대 = 핑크 */
  --c-track-shared: var(--lavender-ink); /* 함께 = 라벤더 */
  /* 기존 반경 별칭(시각 무회귀): --radius=14=r-md, --radius-sm=8=r-xs */
  --radius: var(--r-md);
  --radius-sm: var(--r-xs);

  /* 타이포 — Pretendard 우선(self-host, Task 4) + 디스플레이 스택 */
  --font-sans: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-display: 'Quicksand', 'Cafe24Ssurround', 'Pretendard', sans-serif;
  --fs-h1: 1.75rem;
  --fs-title: 1.5rem;
  --fs-h2: 1.125rem;
  --fs-body: 1rem;
  --fs-label: 0.875rem;
  --fs-caption: 0.8125rem;
  --fs-micro: 0.7rem;

  /* 간격(4pt) — --sp-5(미사용)는 Task 후속 정리 */
  --sp-1: 0.25rem;
  --sp-2: 0.5rem;
  --sp-3: 0.75rem;
  --sp-4: 1rem;
  --sp-6: 1.5rem;

  /* safe-area */
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);

  /* 레이아웃 상수 */
  --tabbar-h: 72px;
  --sheet-peek-h: calc(112px + var(--safe-bottom));
  --app-vh: 100dvh;

  /* 모션 */
  --motion-fast: 140ms;
  --motion-base: 240ms;
  --ease: cubic-bezier(0.22, 0.61, 0.36, 1);
}
```

> 주의: `--sp-5`를 위 블록에서 뺐다. Step 5에서 잔여 참조를 확인 후 안전 제거한다.

- [ ] **Step 4: 다크 블록 교체(평탄화 금지)** — 기존 `@media (prefers-color-scheme: dark) { :root { ... } }`의 내용물을 1급 토큰 override로 교체(별칭이 자동 추종):

```css
@media (prefers-color-scheme: dark) {
  :root {
    /* 마시멜로 잠정 다크(어두운 자두/로즈 — 라이트 단순반전 금지, 진짜 팔레트는 후속 라운드). */
    --bg: #241016;
    --surface: #2e1820;
    --surface-soft: #3a2129;
    --ink: #ffe3ea;
    --ink-muted: #d7a9b4;
    --ink-faint: #9c7782;
    --line: #4a2c36;
    --line-strong: #5e3b46;
    --pink-100: #4a2230;
    --pink-200: #5e2c3d;
    --pink-400: #ff9db4;
    --pink-600: #ff9db4;
    --pink-ink: #ffc2d2;
    --yellow-300: #ffd86b;
    --yellow-ink: #ffe6a6;
    --mint-ink: #7fd3b3;
    --lavender-ink: #c3aef0;
    --like: #ff8fa6;
    --ok: #6fb98a; --ok-ink: #a8e6c6;
    --danger: #e87a6d; --danger-ink: #ffb3aa;
    --shadow-raised: 0 2px 10px rgba(0, 0, 0, 0.40);
    --shadow-floating: 0 10px 28px rgba(0, 0, 0, 0.55);
    --c-cta-fg: #2e1820; /* 다크: 밝은 핑크 위 어두운 글자 */
  }
}
```

> 다크 그림자는 예외적으로 어두운 표면 위 깊이 표현을 위해 검정 알파 허용(라이트의 '검정 그림자 금지'는 밝은 표면 전용 규칙). 이는 spec §4 '잠정 다크' 범위.

- [ ] **Step 5: 데드 토큰 정리** — `--sp-5` 잔여 참조 확인:
Run: `grep -rn "var(--sp-5)\|--c-accent\|var(--c-track-mine)" src/` 후, `--sp-5` 사용처가 있으면 `--sp-6` 또는 적절 토큰으로 치환(없으면 제거 완료). 미정의 참조 토큰(`--c-accent` 등 6개)이 잡히면 마시멜로 토큰으로 매핑하거나 제거.

- [ ] **Step 6: 통과 확인**

Run: `npx vitest run src/__tests__/tokensContrast.test.ts && npm run typecheck && npm run build`
Expected: 토큰 대비 게이트 PASS(미달 시 해당 hex를 더 진하게 보정 후 재실행), tsc 0, build 성공. (이 시점에 별칭 레이어로 전 화면 색이 마시멜로로 전환됨.)

- [ ] **Step 7: 커밋**

```bash
git add src/styles/tokens.css src/__tests__/tokensContrast.test.ts
git commit -m "feat(design): 마시멜로 토큰 + 별칭 레이어 + 잠정 다크 교체 + 조건부 대비 게이트(R1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 가중치 700/800 정리(→ 600 이하)

**Files:** `font-weight: 700|800` 사용 ~14곳(grep으로 특정)

- [ ] **Step 1: 사용처 특정**

Run: `grep -rn "font-weight:\s*\(700\|800\|bold\)" src/`
Expected: ~14곳 목록(ConnectPage 등 800 포함).

- [ ] **Step 2: 일괄 하향** — 각 `font-weight: 700|800|bold`를 `600`으로 변경(마시멜로: 400/500/600만). 시맨틱상 더 약해도 되는 곳은 500.

- [ ] **Step 3: 잔여 0 확인**

Run: `grep -rn "font-weight:\s*\(700\|800\|bold\)" src/ ; echo "exit:$?"`
Expected: 매칭 0(grep exit 1).

- [ ] **Step 4: 게이트** — Run: `npm run build` → 성공.

- [ ] **Step 5: 커밋**

```bash
git add -A src/
git commit -m "refactor(design): 폰트 가중치 700/800 → 600 이하 정리(마시멜로 400/500/600)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 폰트 self-host(@font-face) + --font-display

**Files:** `package.json`, `src/main.tsx`, `src/styles/tokens.css`(@font-face for Cafe24)

- [ ] **Step 1: 의존성 설치(self-host woff2 포함)**

Run: `npm i pretendard @fontsource/quicksand`
Expected: 두 패키지 추가(woff2 + css 동봉).

- [ ] **Step 2: main.tsx에서 폰트 CSS import** — `src/main.tsx` 상단(토큰 import 위)에 추가

```ts
import 'pretendard/dist/web/static/pretendard.css'
import '@fontsource/quicksand/400.css'
import '@fontsource/quicksand/500.css'
import '@fontsource/quicksand/600.css'
```

- [ ] **Step 3: Cafe24 Ssurround @font-face(우아한 폴백)** — `src/styles/tokens.css` 최상단에 추가

```css
/* Cafe24 Ssurround(OFL) — public/fonts/에 woff2를 두면 디스플레이 폰트로 사용, 없으면 Quicksand/Pretendard 폴백. */
@font-face {
  font-family: 'Cafe24Ssurround';
  src: url('/fonts/Cafe24Ssurround.woff2') format('woff2');
  font-weight: 400 600;
  font-display: swap;
}
```

> `--font-sans`(Pretendard)·`--font-display`(Quicksand→Cafe24→Pretendard)는 Task 2에서 이미 정의됨. 디스플레이 폰트를 실제로 적용할 큰 제목/앱명 클래스는 R2 프리미티브에서 `font-family: var(--font-display)`로 연결한다(R1은 로딩·토큰까지).

- [ ] **Step 4: 게이트** — Run: `npm run typecheck && npm run build`
Expected: tsc 0, build 성공(폰트 자산 번들에 포함). Cafe24 woff2가 없어도 빌드는 통과(런타임 폴백).

- [ ] **Step 5: 커밋**

```bash
git add package.json package-lock.json src/main.tsx src/styles/tokens.css
git commit -m "feat(design): 폰트 self-host(Pretendard+Quicksand OFL) + Cafe24 @font-face 폴백 + --font-display

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> **사용자 자산(선택):** Cafe24 Ssurround woff2를 `public/fonts/Cafe24Ssurround.woff2`로 투입하면 디스플레이 성격이 살아난다(없어도 동작).

---

## Task 5: 그라데이션 셰이머 제거

**Files:** 셰이머 위치(grep으로 특정 — Skeleton/RouteFallback 등)

- [ ] **Step 1: 그라데이션 사용처 특정**

Run: `grep -rn "linear-gradient\|radial-gradient" src/`
Expected: 셰이머 2곳(Skeleton/RouteFallback 류) + 기타.

- [ ] **Step 2: 비-그라데이션 대체** — 셰이머를 플랫 펄스로 교체(예: 배경 `var(--surface-soft)` + `opacity` 펄스 애니메이션, reduce-motion 존중). 그라데이션 셰이머 키프레임 제거.

```css
/* 예: Skeleton — 그라데이션 스윕 대신 부드러운 핑크 펄스 */
.skeleton {
  background: var(--surface-soft);
  animation: pulse var(--motion-base) ease-in-out infinite alternate;
}
@keyframes pulse { from { opacity: 1; } to { opacity: 0.55; } }
```

- [ ] **Step 3: 잔여 확인** — Run: `grep -rn "linear-gradient" src/components/common/` → 셰이머 그라데이션 0.

- [ ] **Step 4: 게이트** — Run: `npm run build` → 성공.

- [ ] **Step 5: 커밋**

```bash
git add -A src/
git commit -m "refactor(design): 그라데이션 셰이머 → 플랫 핑크 펄스(AI 냄새 차단·reduce-motion 존중)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: e2e 스냅샷 재생성 + R1 최종 게이트

**Files:** e2e 스냅샷 베이스라인(라이트/다크 15장)

- [ ] **Step 1: 전 게이트(스냅샷 제외) 통과 확인**

Run: `npm run typecheck && npm run test && npm run build`
Expected: tsc 0, vitest 전체 통과(contrast·tokensContrast 포함), build 성공.

- [ ] **Step 2: 스냅샷 재생성(라이트+다크)** — 토큰 전면 교체로 15장이 모두 변함(의도된 갱신).

Run: `SEED_SNAPSHOT=1 npx playwright test --update-snapshots`
Expected: 전 스냅샷 재생성. `git status -- e2e/`로 변경 베이스라인 확인 후 **각 이미지를 육안 점검**(마시멜로 톤·다크가 라이트와 다른지·검정 그림자 사라졌는지).

- [ ] **Step 3: 클린 비교** — Run: `npm run e2e` → 전 통과(갱신된 베이스라인 대비).

- [ ] **Step 4: 커밋**

```bash
git add e2e/
git commit -m "test(e2e): 마시멜로 R1 토큰 적용 스냅샷 재생성(라이트+다크)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 최종 게이트(R1 완료 조건)
- [ ] `npm run typecheck` 0
- [ ] `npm run test` 통과(contrast·tokensContrast 신규 포함)
- [ ] `npm run build` 성공
- [ ] `npm run e2e` 통과(라이트+다크 베이스라인 재생성·육안 확인)
- [ ] 별칭 레이어로 전 화면 색이 마시멜로로 전환됨(호출부 변경 0)
- [ ] 다크 분기 유지·평탄화 아님(다크 스냅샷이 라이트와 다름)
- [ ] 가중치 700/800 0, 그라데이션 셰이머 0, 검정 그림자 토큰 0(라이트)
- [ ] 접근성: 색+패턴/라벨 이중화 코드 무변경(R1은 토큰만), reduce-motion 보존
- [ ] RLS/EXIF: 해당 없음(N/A — 시각 토큰만)

## 정직성
실제 폰트 렌더·실기기 색감은 스텁/헤드리스가 100% 재현 못 함. 토큰값·대비계산·스냅샷으로 검증하고 최종 색/여백 미세조정은 실기기 육안이 남는다(R1 종료 시 명시). Cafe24 디스플레이는 woff2 투입 전까진 Quicksand/Pretendard 폴백.
