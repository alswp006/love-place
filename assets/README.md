# 네이티브 앱 아이콘 / 스플래시 소스 (@capacitor/assets)

마시멜로 앱 아이콘·스플래시 소스. 실제 네이티브 리소스 생성은 **`ios/`·`android/` 프로젝트가 있어야** 하므로 사용자(맥) 단계다.

## 생성 순서
1. `npx cap add ios` (필요 시 `npx cap add android`) — 네이티브 프로젝트 생성(Xcode/Android Studio).
2. 고해상도 소스 준비:
   - 권장: `assets/icon-only.png`(1024×1024), `assets/splash.png`(2732×2732), `assets/splash-dark.png`.
   - 빠른 시작: 이 폴더의 `logo.svg`를 1024 PNG로 export해 `assets/icon-only.png`로 저장(또는 @capacitor/assets가 SVG를 직접 읽기도 함).
3. `npm run generate:assets` → iOS/Android 전 사이즈 아이콘·스플래시 자동 생성.

## 참고
- 스플래시 **배경색**은 `capacitor.config.ts`의 `SplashScreen.backgroundColor: #fff1f4`로 이미 마시멜로 핑크(소스 이미지 없어도 흰 깜빡임 대신 핑크 런치 화면).
- 색: 배경 `#fff1f4`, 핑크 `#ff93ac`, 라벤더 `#c3aee0`.
