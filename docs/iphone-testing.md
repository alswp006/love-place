# 아이폰에서 테스트하고 쓰는 법

> 둘 다 아이폰. App Store 없이 **PWA(웹앱)**로 쓴다 — 링크만 열면 끝, 홈 화면에 추가하면 앱처럼 동작.

## TL;DR

| 목적 | 명령 | 비고 |
|---|---|---|
| 자동 검증(4게이트) | `npm run typecheck && npm test && npm run build && npm run e2e` | 커밋 전 항상 |
| **아이폰에서 모양 확인** (같은 WiFi) | `npm run iphone:lan` | QR 스캔 → Safari. **http라 PWA·위치 X** |
| **아이폰에서 PWA 진짜 동작** | `npm run build && npm run iphone:tunnel` | https 터널. 설치·SW·위치 O |
| 최종(둘이 상시 사용) | Vercel/CF Pages 배포 | 고정 https 주소 |

## 테스트 사다리

1. **자동 게이트** — `npm run e2e`는 이미 모바일 뷰포트(Pixel 7 크기)로 5탭 렌더·네비를 검증한다.
2. **데스크톱 + 기기 시뮬레이션** — `npm run dev` → Chrome/Safari DevTools "iPhone" 모드. 레이아웃·다크모드·Reduce Motion 빠르게 확인.
3. **실제 아이폰, LAN(http)** — `npm run iphone:lan`. 진짜 기기의 폰트·스크롤·노치·터치 감. ⚠️ http라 서비스워커/위치/PWA 설치는 안 됨(iOS 제약).
4. **실제 아이폰, HTTPS 터널** — `npm run build && npm run iphone:tunnel`. PWA 설치·오프라인·위치·카카오맵까지 진짜로.
5. **배포 URL** — 둘이 쓰는 최종 무대.

## iPhone(iOS Safari) 특화 주의점

- **서비스워커/위치/카메라는 https(또는 localhost)에서만.** LAN http(`iphone:lan`)는 모양 확인용, 진짜 동작은 터널/배포.
- **웹 푸시는 iOS 16.4+ & "홈 화면에 추가된 PWA"에서만.** 그래서 이 앱은 **인앱 활동 피드가 1차 알림**, 푸시는 보조(설계서 §8).
- **홈 화면 추가**: Safari 공유 버튼 → "홈 화면에 추가" → 주소창 없는 standalone 앱으로 실행(아이콘·테마·safe-area 적용).
- **Safari 7일 저장소 정리**: 오래 안 쓰면 캐시/IndexedDB가 비워질 수 있음 → 중요한 쓰기는 재연결 시 서버 동기화 전제(§4.3).
- **핀치 줌 가능**(접근성). 100vh 버그·노치는 `100dvh` + `env(safe-area-inset-*)`로 처리됨.

## 둘이 연결해서 쓰는 흐름 (P0b/P0d 구현 후)

1. 한 명이 배포 URL 접속 → **매직링크 로그인**(Supabase).
2. "우리" 탭에서 **1회용 초대 코드** 생성 → 상대에게 전달.
3. 상대가 같은 URL 접속 → 로그인 → 코드 입력 → **둘이 연결(ACTIVE)**.
4. 각자 **홈 화면에 추가** → 둘만의 여행 앱 완성.

## 트러블슈팅

- **아이폰이 LAN 주소에 접속 안 됨** → 둘이 같은 WiFi인지, Mac 방화벽이 막는지 확인. 안 되면 터널 사용.
- **포트 충돌(5173/4173 사용 중)** → `PORT=5180 npm run iphone:lan` 처럼 포트 지정.
- **터널 URL이 안 열림** → 잠깐 기다렸다 새로고침(DNS 전파). cloudflared 무료 터널은 세션마다 주소가 바뀜.
- **`cloudflared` 없음** → `brew install cloudflared`.
