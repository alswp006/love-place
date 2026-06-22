# P-A.5 — 네이티브 폴리시 Implementation Plan

> REQUIRED SUB-SKILL: executing-plans(인라인). 각 태스크 TDD/구현 → typecheck0·vitest·build 게이트 → 커밋 → 마지막 push.
> 전제: P-A 완료(Capacitor·platform 래퍼·SW 게이트·딥링크·OTP 우선). 이번 라운드는 출시 품질 폴리시.

**Goal:** Capacitor 래퍼를 "스토어 제출 품질"로 — 진짜 햅틱, 상태바, 키보드, 안드로이드 백, 구글 OAuth(WebView 차단 회피), 스플래시/아이콘 셋업.

**범위 한계(정직):** `ios/`·`android/` 네이티브 프로젝트는 `npx cap add`(맥/Xcode 필요, 사용자 실행)로 생성됨. 따라서 **아이콘/스플래시 실제 생성**과 **OAuth 딥링크 복귀의 URL scheme**은 코드/설정/문서까지만 하고 실제 적용은 사용자 단계로 인계. 나머지(햅틱·상태바·키보드·백·OAuth JS 경로)는 코드+테스트 완결.

## Tasks
1. **plugins**: `@capacitor/status-bar @capacitor/keyboard @capacitor/haptics @capacitor/browser @capacitor/splash-screen` + devDep `@capacitor/assets`.
2. **haptics**(`src/lib/haptics.ts`): 네이티브=`@capacitor/haptics` `Haptics.impact`, 웹=기존 `navigator.vibrate` 폴백. (iOS WKWebView vibrate 미지원 해소.) 테스트: 네이티브/웹 분기.
3. **statusBar**(`src/lib/native/initNative.ts`): 네이티브에서 `StatusBar.setStyle`(라이트bg→어두운 글자/다크bg→밝은 글자) + Android `setBackgroundColor`(#fff1f4/#241016). 웹 no-op.
4. **keyboard**: `capacitor.config.ts` plugins `Keyboard.resize: 'native'`. (입력창 키보드 가림 보정.)
5. **backButton**(initNative): 네이티브 `App.addListener('backButton')` → canGoBack면 history.back, 아니면 exitApp(안드로이드 하드웨어 백). 테스트.
6. **splash**: `capacitor.config.ts` plugins `SplashScreen`(launchAutoHide:false, backgroundColor #fff1f4) + 앱 마운트 후 `SplashScreen.hide()`(initNative). 
7. **google OAuth**(`src/hooks/useSignInWithGoogle.ts`): 네이티브면 `signInWithOAuth({skipBrowserRedirect:true})` → `Browser.open(data.url)`(시스템 브라우저, Google WebView 차단 회피) → 복귀는 기존 appUrlOpen→exchangeCodeForSession. 웹은 기존 리다이렉트. redirect base는 `VITE_PUBLIC_SITE_URL || origin`. 테스트: 네이티브/웹 분기.
8. **assets 셋업**(`@capacitor/assets`): `assets/` 소스(마시멜로 로고 SVG·splash) + `generate:assets` 스크립트 + 문서. 실제 생성은 `cap add` 후 사용자 실행.
9. **wire**: `main.tsx`에서 `initNative()` 호출(statusBar+backButton+splash hide). 
10. **gate + push**: typecheck0/vitest/build/e2e + main push. 인계 체크리스트(cap add·URL scheme·assets 생성·실기기).

## 게이트
tsc0 / vitest(haptics·statusBar·backButton·google 신규) / build / e2e. 기능·데이터 불변(N/A RLS/EXIF). reduce-motion·a11y 무회귀.
