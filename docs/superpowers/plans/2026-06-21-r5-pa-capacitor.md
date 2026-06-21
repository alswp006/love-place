# R5 · P-A — Capacitor 패키징 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 React+Vite+TS PWA를 Capacitor로 감싸 iOS/Android 네이티브 앱으로 빌드 가능하게 한다. 백그라운드 GPS·위치 권한은 **일절 추가하지 않는다**(R6 게이트). 매직링크 PKCE 교차컨텍스트 함정은 네이티브에서 6자리 OTP 우선으로 회피한다.

**Architecture:** 웹 코드는 그대로. 얇은 플랫폼 래퍼(`isNativePlatform()`)를 단일 출처로 두고 ① PWA 서비스워커는 네이티브에서 등록 안 함(로컬 자산 충돌 방지) ② 매직링크 딥링크 복귀는 `appUrlOpen`→`exchangeCodeForSession`, 단 1차 인증 경로는 OTP 코드 ③ 네이티브 프로젝트(ios/android)는 `npx cap add`로 생성(사용자 실행). 새 DB·서버 변경 없음.

**Tech Stack:** Capacitor 6(@capacitor/core·cli·ios·android·app), 기존 Supabase Auth(pkce), vite-plugin-pwa, vitest.

**검증 한계(정직성):** 네이티브 빌드/실행/서명/TestFlight·Play 내부테스트와 매직링크 크로스컨텍스트·`navigator.share`·실기기 손맛은 **사용자 실행**이며 단위 테스트로 못 잡는다. 에이전트는 코드/설정/단위 테스트까지 책임지고, 네이티브 단계는 체크리스트로 인계한다.

---

## File Structure

**새로 만들 파일**
- `src/lib/platform.ts` — Capacitor 네이티브 감지 단일 래퍼(`isNativePlatform`, `getPlatformName`). 다른 코드는 Capacitor를 직접 import하지 않고 이걸 쓴다(모킹·테스트 용이).
- `src/lib/pwa.ts` — 서비스워커 등록을 `isNativePlatform()`로 게이트하는 `registerPwa()`.
- `src/lib/native/authDeepLink.ts` — 네이티브 전용 `appUrlOpen` 리스너 + `exchangeFromUrl(url)`(코드 추출→세션 교환, 순수 테스트 가능).
- `capacitor.config.ts` — Capacitor 설정(appId/appName/webDir).
- `src/__tests__/platform.test.ts`, `pwa.test.ts`, `authDeepLink.test.ts`, `loginNative.test.tsx` — 단위 테스트.

**수정할 파일**
- `vite.config.ts` — `VitePWA({ injectRegister: null })`(자동 주입 끄고 수동 등록).
- `src/main.tsx` — `registerPwa()` + `initNativeAuthDeepLink()` 호출.
- `src/hooks/useSignInWithOtp.ts` — `emailRedirectTo`를 `VITE_PUBLIC_SITE_URL`(있으면) 기준으로(네이티브 로컬 origin 회피).
- `src/pages/auth/LoginPage.tsx` — 네이티브면 OTP 코드 입력을 1차로 안내(링크 강조 완화).
- `package.json` — Capacitor deps + `cap:*`/`build:native` 스크립트.
- `src/vite-env.d.ts` — `vite-plugin-pwa/client` 타입 참조(없으면 생성).
- `.gitignore` — 네이티브 빌드 산출물 무시 규칙(아래 Task 2 주석).

**사용자 실행(에이전트 비대상, 체크리스트로 인계)**
- `npx cap add ios` / `npx cap add android`(Xcode·Android Studio·CocoaPods 필요), 서명/번들ID, 시뮬레이터/실기기 실행, TestFlight·Play 내부테스트, Supabase Redirect URLs에 사이트/딥링크 등록.

---

## Task 1: 플랫폼 래퍼 + Capacitor 의존성

**Files:**
- Create: `src/lib/platform.ts`
- Test: `src/__tests__/platform.test.ts`
- Modify: `package.json`(deps)

- [ ] **Step 1: 실패 테스트 작성** — `src/__tests__/platform.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { isNativePlatform, getPlatformName } from '@/lib/platform'

// jsdom(웹)에는 Capacitor 네이티브 브리지가 없으므로 항상 web으로 도출돼야 한다.
describe('platform 래퍼', () => {
  it('웹(jsdom)에서 isNativePlatform()은 false', () => {
    expect(isNativePlatform()).toBe(false)
  })
  it('웹에서 getPlatformName()은 "web"', () => {
    expect(getPlatformName()).toBe('web')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/__tests__/platform.test.ts`
Expected: FAIL — `Cannot find module '@/lib/platform'` (또는 `@capacitor/core` 미설치).

- [ ] **Step 3: 의존성 설치**

Run:
```bash
npm i @capacitor/core @capacitor/app @capacitor/ios @capacitor/android
npm i -D @capacitor/cli
```
Expected: package.json에 `@capacitor/*` 추가, lockfile 갱신.

- [ ] **Step 4: 구현** — `src/lib/platform.ts`

```ts
import { Capacitor } from '@capacitor/core'

// 네이티브(Capacitor) 여부 단일 출처 — 다른 모듈은 Capacitor를 직접 import하지 않고 이 함수를 쓴다.
// 웹(브라우저/PWA)에서는 항상 false / 'web' (네이티브 브리지 부재 시 Capacitor가 그렇게 보고).
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

export function getPlatformName(): 'ios' | 'android' | 'web' {
  const p = Capacitor.getPlatform()
  return p === 'ios' || p === 'android' ? p : 'web'
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/__tests__/platform.test.ts && npm run typecheck`
Expected: PASS, tsc 0.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/platform.ts src/__tests__/platform.test.ts package.json package-lock.json
git commit -m "feat(native): Capacitor 의존성 + isNativePlatform 플랫폼 래퍼

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: capacitor.config.ts + npm 스크립트 + .gitignore

**Files:**
- Create: `capacitor.config.ts`
- Modify: `package.json`(scripts), `.gitignore`

- [ ] **Step 1: 설정 파일 생성** — `capacitor.config.ts`

```ts
import type { CapacitorConfig } from '@capacitor/cli'

// Capacitor 설정 — webDir는 vite 빌드 산출물(dist). appId는 스토어 제출 후 변경 어려우니 첫 빌드 전 확정할 것.
// 백그라운드 위치/지오로케이션 plugin은 의도적으로 없음(R6 게이트). server.url(라이브리로드)은 기본 비활성.
const config: CapacitorConfig = {
  appId: 'app.loveplace',
  appName: 'love place',
  webDir: 'dist',
  ios: { contentInset: 'always' },
  // androidScheme=https로 두면 Android WebView origin이 https://localhost — 표준/안전(혼합콘텐츠 회피).
  server: { androidScheme: 'https' },
}

export default config
```

> 주: `appId`(`app.loveplace`)는 예시 — 사용자가 첫 `cap add`/스토어 등록 전 원하는 번들ID로 바꿀 수 있다. 바꾸려면 이 파일만 수정 후 `npx cap sync`.

- [ ] **Step 2: npm 스크립트 추가** — `package.json`의 `scripts`에 추가

```jsonc
"cap:sync": "cap sync",
"cap:ios": "cap open ios",
"cap:android": "cap open android",
"build:native": "vite build && cap sync"
```

- [ ] **Step 3: .gitignore 보강** — 네이티브 생성물 중 빌드 캐시만 무시(프로젝트 자체는 커밋해 재현성 확보)

`.gitignore`에 추가:
```
# Capacitor 네이티브 빌드 캐시(프로젝트 ios/·android/는 커밋, 빌드 산출물만 무시)
/ios/App/Pods
/ios/App/build
/android/.gradle
/android/app/build
/android/build
```

- [ ] **Step 4: 설정 로드 검증**

Run: `npx cap --version && npx tsc --noEmit -p tsconfig.json`
Expected: Capacitor CLI 버전 출력, tsc 0(capacitor.config.ts 타입 OK).

- [ ] **Step 5: 커밋**

```bash
git add capacitor.config.ts package.json .gitignore
git commit -m "feat(native): capacitor.config + cap 스크립트 + 네이티브 빌드 gitignore

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> **사용자 실행(이 태스크 직후, 에이전트 비대상):** `npx cap add ios` 및/또는 `npx cap add android` → `npm run build:native` → `npm run cap:ios`(Xcode에서 시뮬레이터 실행). 생성된 `ios/`·`android/`는 별도 커밋. (Xcode·CocoaPods·Android Studio 필요.)

---

## Task 3: 서비스워커를 브라우저 전용으로 게이트

**Files:**
- Create: `src/lib/pwa.ts`, `src/__tests__/pwa.test.ts`
- Modify: `vite.config.ts`, `src/main.tsx`, `src/vite-env.d.ts`

- [ ] **Step 1: 실패 테스트 작성** — `src/__tests__/pwa.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const registerSW = vi.fn()
vi.mock('virtual:pwa-register', () => ({ registerSW }))
const platform = vi.hoisted(() => ({ native: false }))
vi.mock('@/lib/platform', () => ({ isNativePlatform: () => platform.native }))

import { registerPwa } from '@/lib/pwa'

describe('registerPwa — 네이티브 게이트', () => {
  beforeEach(() => registerSW.mockClear())

  it('웹에서는 서비스워커를 등록한다', async () => {
    platform.native = false
    await registerPwa()
    expect(registerSW).toHaveBeenCalledTimes(1)
  })

  it('네이티브(Capacitor)에서는 등록하지 않는다(로컬 자산 충돌 방지)', async () => {
    platform.native = true
    await registerPwa()
    expect(registerSW).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/__tests__/pwa.test.ts`
Expected: FAIL — `@/lib/pwa` 없음.

- [ ] **Step 3: 타입 참조 추가** — `src/vite-env.d.ts`(없으면 생성)

```ts
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
```

- [ ] **Step 4: vite.config 자동 주입 끄기** — `vite.config.ts`의 `VitePWA({ ... })`에 `injectRegister: null,` 추가(`registerType: 'autoUpdate'` 옆).

- [ ] **Step 5: 구현** — `src/lib/pwa.ts`

```ts
import { isNativePlatform } from './platform'

// PWA 서비스워커 등록 — 브라우저에서만. 네이티브(Capacitor)는 로컬 번들 자산을 직접 서빙하므로
// SW를 등록하면 자산/캐시가 충돌한다(빈 화면·스테일 캐시 위험) → 등록하지 않는다.
export async function registerPwa(): Promise<void> {
  if (isNativePlatform()) return
  const { registerSW } = await import('virtual:pwa-register')
  registerSW({ immediate: true })
}
```

- [ ] **Step 6: main.tsx에서 호출** — `src/main.tsx`의 `createRoot(...).render(...)` **다음**에 추가

```ts
import { registerPwa } from '@/lib/pwa'
// ...render(...) 이후
void registerPwa()
```

- [ ] **Step 7: 통과 확인**

Run: `npx vitest run src/__tests__/pwa.test.ts && npm run typecheck && npm run build`
Expected: 테스트 PASS, tsc 0, build 성공(여전히 `dist/sw.js` 생성 — 등록만 수동으로 바뀜).

- [ ] **Step 8: 커밋**

```bash
git add src/lib/pwa.ts src/__tests__/pwa.test.ts vite.config.ts src/main.tsx src/vite-env.d.ts
git commit -m "feat(native): 서비스워커 등록을 브라우저 전용으로 게이트(injectRegister:null + registerPwa)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 네이티브 딥링크 인증 핸들러

**Files:**
- Create: `src/lib/native/authDeepLink.ts`, `src/__tests__/authDeepLink.test.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: 실패 테스트 작성** — `src/__tests__/authDeepLink.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const exchange = vi.fn(async () => ({ data: {}, error: null }))
vi.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { exchangeCodeForSession: exchange } },
}))
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }))

import { exchangeFromUrl } from '@/lib/native/authDeepLink'

describe('exchangeFromUrl — 딥링크 코드→세션', () => {
  beforeEach(() => exchange.mockClear())

  it('?code=가 있으면 exchangeCodeForSession(code) 호출 후 true', async () => {
    const ok = await exchangeFromUrl('app.loveplace://auth/callback?code=ABC123')
    expect(exchange).toHaveBeenCalledWith('ABC123')
    expect(ok).toBe(true)
  })

  it('code가 없으면 교환하지 않고 false', async () => {
    const ok = await exchangeFromUrl('app.loveplace://auth/callback')
    expect(exchange).not.toHaveBeenCalled()
    expect(ok).toBe(false)
  })

  it('잘못된 URL은 throw하지 않고 false', async () => {
    const ok = await exchangeFromUrl('not a url')
    expect(ok).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/__tests__/authDeepLink.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현** — `src/lib/native/authDeepLink.ts`

```ts
import { App } from '@capacitor/app'
import { supabase } from '@/lib/supabase/client'
import { isNativePlatform } from '@/lib/platform'

// 매직링크가 커스텀 스킴/유니버설 링크로 앱에 돌아오면(appUrlOpen) URL의 code를 세션으로 교환한다.
// (1차 인증 경로는 OTP 코드이지만, 링크 경로도 가능한 한 살린다.) 웹에선 no-op.
export async function exchangeFromUrl(url: string): Promise<boolean> {
  try {
    const code = new URL(url).searchParams.get('code')
    if (!code) return false
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    return !error
  } catch {
    return false
  }
}

export function initNativeAuthDeepLink(): void {
  if (!isNativePlatform()) return
  void App.addListener('appUrlOpen', ({ url }) => {
    void exchangeFromUrl(url)
  })
}
```

- [ ] **Step 4: main.tsx에서 초기화** — `src/main.tsx`에 import + `void registerPwa()` 옆에 추가

```ts
import { initNativeAuthDeepLink } from '@/lib/native/authDeepLink'
// ...
initNativeAuthDeepLink()
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/__tests__/authDeepLink.test.ts && npm run typecheck`
Expected: PASS, tsc 0.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/native/authDeepLink.ts src/__tests__/authDeepLink.test.ts src/main.tsx
git commit -m "feat(native): appUrlOpen 딥링크→exchangeCodeForSession(네이티브 전용, 웹 no-op)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 네이티브에서 OTP 코드 우선 인증

**Files:**
- Modify: `src/hooks/useSignInWithOtp.ts`, `src/pages/auth/LoginPage.tsx`
- Test: `src/__tests__/signInWithOtp.test.ts`(보강), `src/__tests__/loginNative.test.tsx`(신규)

- [ ] **Step 1: 실패 테스트 — redirect 베이스** `src/__tests__/signInWithOtp.test.ts`에 케이스 추가

```ts
// VITE_PUBLIC_SITE_URL이 설정되면 emailRedirectTo가 그 사이트의 /auth/callback을 가리킨다
// (네이티브 WebView의 로컬 origin이 매직링크 redirect로 새는 것을 방지).
it('VITE_PUBLIC_SITE_URL이 있으면 그 사이트/auth/callback로 emailRedirectTo를 보낸다', async () => {
  vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://love.example.app')
  const { result } = renderHook(() => useSignInWithOtp())
  await act(async () => { await result.current.sendMagicLink('a@b.com') })
  expect(signInWithOtp).toHaveBeenCalledWith(
    expect.objectContaining({
      options: expect.objectContaining({ emailRedirectTo: 'https://love.example.app/auth/callback' }),
    }),
  )
  vi.unstubAllEnvs()
})
```
> 기존 테스트가 `supabase.auth.signInWithOtp`를 모킹하는 방식(`signInWithOtp` 스파이)에 맞춰 변수명을 정렬할 것. 모킹 패턴이 다르면 그 패턴으로 단언만 동일 의미로 작성.

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/__tests__/signInWithOtp.test.ts`
Expected: FAIL — 현재는 항상 `window.location.origin`을 쓰므로 새 단언 실패.

- [ ] **Step 3: useSignInWithOtp 수정** — `sendMagicLink`의 redirect 계산 교체

```ts
// 네이티브 WebView의 로컬 origin(capacitor://·https://localhost)이 매직링크 redirect로 새지 않도록,
// 배포된 사이트 URL이 있으면 그걸 베이스로 한다(없으면 기존처럼 현재 origin).
const base = import.meta.env.VITE_PUBLIC_SITE_URL?.trim() || window.location.origin
const redirectTo = `${base}/auth/callback`
```

- [ ] **Step 4: 통과 확인(1차)**

Run: `npx vitest run src/__tests__/signInWithOtp.test.ts && npm run typecheck`
Expected: PASS, tsc 0.

- [ ] **Step 5: 실패 테스트 — LoginPage 네이티브 분기** `src/__tests__/loginNative.test.tsx`

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/lib/platform', () => ({ isNativePlatform: () => true, getPlatformName: () => 'ios' }))
vi.mock('@/state/auth', () => ({ useAuth: () => ({ initializing: false, session: null, configured: true }) }))
// OTP 훅을 'sent' 상태로 고정해 코드 입력 화면을 단언한다.
vi.mock('@/hooks/useSignInWithOtp', () => ({
  useSignInWithOtp: () => ({ status: 'sent', error: null, sendMagicLink: vi.fn(), verifyCode: vi.fn(), reset: vi.fn() }),
}))
vi.mock('@/hooks/useSignInWithGoogle', () => ({ useSignInWithGoogle: () => ({ signIn: vi.fn(), loading: false, error: null }) }))
vi.mock('@/hooks/useSignInWithPassword', () => ({ useSignInWithPassword: () => ({ signIn: vi.fn(), status: 'idle', error: null }) }))
vi.mock('@/hooks/useResendCooldown', () => ({ useResendCooldown: () => ({ start: vi.fn(), canResend: true, remaining: 0 }) }))

import LoginPage from '@/pages/auth/LoginPage'

describe('LoginPage — 네이티브 OTP 우선', () => {
  it('네이티브 sent 화면은 6자리 코드 입력을 1차 안내로 노출한다', () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    expect(screen.getByLabelText('6자리 코드')).toBeInTheDocument()
    // 네이티브에선 "메일 링크를 누르면 로그인" 강조 대신 코드 안내가 제목이어야 한다.
    expect(screen.getByText(/코드를 입력/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: 실패 확인**

Run: `npx vitest run src/__tests__/loginNative.test.tsx`
Expected: FAIL — 현재 sent 화면 제목은 "📬 메일을 확인하세요"(코드 안내가 제목 아님).

- [ ] **Step 7: LoginPage 수정** — 네이티브 분기 추가

`src/pages/auth/LoginPage.tsx` 상단에 import:
```ts
import { isNativePlatform } from '@/lib/platform'
```
컴포넌트 내 `const native = isNativePlatform()` 선언 후, `status === 'sent'` 블록의 제목/안내를 네이티브에서 코드 우선으로:
```tsx
<p className={styles.sentTitle}>{native ? '🔑 코드를 입력하세요' : '📬 메일을 확인하세요'}</p>
<p className={styles.sentHint}>
  {native ? (
    <>메일로 받은 <strong>6자리 코드</strong>를 입력해 로그인하세요.</>
  ) : (
    <><strong>{email}</strong> 으로 로그인 링크를 보냈어요.<br />메일의 링크를 누르면 로그인됩니다.</>
  )}
</p>
```
(코드 입력 `<form onSubmit={onVerify}>`은 그대로 — 이미 존재. 네이티브에서도 동일 폼 사용.)

- [ ] **Step 8: 통과 확인(전체)**

Run: `npm run typecheck && npm run test && npm run build`
Expected: tsc 0, vitest 전부 통과(신규 포함), build 성공.

- [ ] **Step 9: 커밋**

```bash
git add src/hooks/useSignInWithOtp.ts src/pages/auth/LoginPage.tsx src/__tests__/signInWithOtp.test.ts src/__tests__/loginNative.test.tsx
git commit -m "feat(native): 네이티브에서 OTP 코드 우선 인증 + 사이트 URL 기준 redirect(PKCE 교차컨텍스트 회피)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 최종 게이트(P-A 완료 조건)

- [ ] `npm run typecheck` 0
- [ ] `npm run test` 통과(신규 platform/pwa/authDeepLink/loginNative 포함)
- [ ] `npm run build` 성공(웹 SW 여전히 생성·수동 등록)
- [ ] `npm run e2e` 통과(웹 경로 무회귀 — SW 등록 방식만 변경, 동작 동일)
- [ ] RLS/EXIF: 해당 없음(N/A — 네이티브 패키징, DB·발행 무관)
- [ ] 접근성: LoginPage 네이티브 분기도 라벨·역할 유지(색만 의존 아님)

## 사용자 인계 체크리스트(에이전트 비대상 — 실기기/스토어)

- [ ] `npx cap add ios` / `npx cap add android` → `ios/`·`android/` 생성·커밋
- [ ] `npm run build:native` → `npm run cap:ios`(Xcode 시뮬레이터/실기기 실행), `cap:android`(Android Studio)
- [ ] Xcode 서명(팀/번들ID), Android 키스토어
- [ ] `.env`에 `VITE_PUBLIC_SITE_URL`(배포 웹 도메인) 설정 → 네이티브 매직링크 redirect가 실 사이트로
- [ ] Supabase 대시보드 Auth → Redirect URLs에 `https://<site>/auth/callback` (필요 시 `app.loveplace://auth/callback` 딥링크) 등록
- [ ] iOS: 매직링크를 앱으로 되돌리려면 Associated Domains/URL Scheme 설정(선택 — OTP 코드만으로도 로그인 가능)
- [ ] 실기기 확인: 앱 실행/로그인(OTP)/네비게이션/`navigator.share`/safe-area·노치
- [ ] TestFlight·Play 내부테스트 업로드
```
