# 네이티브 아이콘 / 스플래시 소스 (@capacitor/assets)

`npm run generate:assets` → iOS `AppIcon.appiconset`·`Splash.imageset`과 PWA 아이콘을 전 사이즈 생성한다.

## 파일
| 파일 | 용도 |
|---|---|
| `icon.png` (1024) | 앱 아이콘. **전면 채움**(iOS가 스스로 스퀘어클 마스크를 씌우므로 둥근 모서리를 굽지 않는다) |
| `icon-only.png` (1024) | 배경 없는 마크. 스플래시·마케팅·인앱 브랜딩용 |
| `splash.png` (2732×2732) | 스플래시. 센터세이프 — 기기 비율이 달라도 잘리지 않게 가장자리 12%는 비워 둔다 |
| `splash-dark.png` | 다크 스플래시. 아트가 이미 밤하늘이라 라이트와 같은 그림을 쓴다 |
| `source/` | 원본 SVG + 디자인 핸드오프 문서(재수출용) |

## 주의
- **입력 폴더는 `assets/`다.** `resources/`(cordova-res 시절 관례)에 두면 조용히 무시되고
  예전 파일로 생성된다 — 실제로 한 번 그렇게 옛 아이콘이 나갔다.
- `capacitor-assets generate`는 **`public/manifest.webmanifest`를 덮어쓴다**(경로를 `../icons/`로,
  mime을 image/png로, background_color를 자기 값으로). 생성 후 manifest를 반드시 확인할 것.
- 스플래시 배경색은 `capacitor.config.ts`의 `SplashScreen.backgroundColor`(#141527 — 밤하늘 상단색).
  아트가 뜨기 전 한 프레임을 이 색으로 덮어 흰 깜빡임을 막는다.
