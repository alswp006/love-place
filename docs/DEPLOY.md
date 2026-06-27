# 배포 / 출시 가이드 (love place)

코드는 준비됨. 아래는 **실제 출시에 필요한 환경값·시크릿·네이티브·스토어** 절차를 한 곳에 모은 것. (상세 단계별 로드맵은 대화 참고.)

## 1. 클라이언트 환경변수 (`.env`, `VITE_*` = 공개값)
| 키 | 용도 |
|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Supabase(anon — RLS가 방어선) |
| `VITE_NAVER_MAP_CLIENT_ID` | 네이버 지도 JS SDK(NCP Web Dynamic Map, 도메인 등록) |
| `VITE_KAKAO_JS_KEY` | (롤백용) 카카오맵 JS — 미사용 |
| `VITE_PUBLIC_SITE_URL` | 배포 도메인 — 네이티브 매직링크/OAuth redirect 기준 |

## 2. Edge Function 시크릿 (`supabase secrets set KEY=값`) — 절대 클라이언트 금지
| 시크릿 | 쓰는 함수 |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | 전 프록시(미들웨어) |
| `ANTHROPIC_API_KEY` (+`ANTHROPIC_MODEL`) | `ai-route` (AI 코스) |
| `KAKAO_REST_KEY` | `naver-search`/`kakao-search`, `directions`(도로스냅 1차) |
| `TMAP_APP_KEY` | `directions` 폴백(R5 도로스냅) |
| (선택) `MONTHLY_CAP_AI_ROUTE` / `MONTHLY_CAP_DIRECTIONS` | 월 호출 상한 |

배포: `supabase functions deploy <name>` (`ai-route`, `naver-search`, `directions` 등).
> ⚠️ 카카오모빌리티 길찾기는 카카오 로컬검색과 **별개 상품** — [개발자 콘솔](https://developers.kakaomobility.com)에서 활성화 + 키/쿼터 확인(별도면 새 시크릿).

## 3. Supabase Auth 설정
- **Redirect URLs**에 `https://<site>/auth/callback` 추가(딥링크 쓰면 `app.loveplace://auth/callback`도).
- **Apple provider** 활성화(Sign in with Apple — App Store 4.8): Apple Developer Service ID + Key 등록 후 Supabase Auth Providers에 입력.
- **Google provider** 활성화: OAuth client + Supabase 입력. (네이티브는 시스템 브라우저로 처리됨 — 코드 반영됨.)

## 4. 네이티브 (iOS/Android) — 맥 필요
```bash
npx cap add ios          # (+ npx cap add android)
npm run build:native     # vite build + cap sync
# 아이콘: assets/icon-only.png(1024) → npm run generate:assets
npm run cap:ios          # Xcode 실행
```
- Xcode: Team 서명 + 번들ID(`app.loveplace` — 변경 시 capacitor.config 먼저).
- iOS URL scheme/Associated Domains 등록(OAuth/매직링크 앱 복귀용; OTP 코드만으로도 로그인 가능).
- Cafe24 Ssurround woff2 → `public/fonts/Cafe24Ssurround.woff2`(없으면 Quicksand/Pretendard 폴백).

## 5. 법무 (영리 출시)
- **개인정보처리방침** `docs/legal/privacy-policy.md` → 공개 URL 호스팅 → 스토어 등록.
- **위치기반서비스사업 신고**(동선 기록/R6 시): [emsit.go.kr](https://www.emsit.go.kr/cp/cv/Cp1440000_0182_01Reg.do), 소상공인 간이신고 가능. **위치정보처리방침** `docs/legal/location-policy.md` 게시 + 위치정보관리책임자 지정.
- 회사 재직 중이면 **취업규칙 겸업금지** 확인.

## 6. 스토어
- iOS: Archive → TestFlight → App Store Connect(스크린샷·설명·개인정보처리방침 URL·App Privacy 라벨) → 심사.
- R6(백그라운드 위치) 출시 시: iOS Always 목적문자열·5.1.5 소명 / Google Play 백그라운드 위치 선언서 + 30초 데모영상.
- 4.8 Sign in with Apple: 구글 로그인과 함께 제공(코드 반영됨) — Apple provider 설정만 하면 됨.
