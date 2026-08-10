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

### 4.1 TestFlight (iOS 실기기 배포)

유료 Apple Developer Program이 전제다($99/년). 무료 계정으로는 TestFlight를 못 쓴다.

**사람이 한 번만 (약 20분)**

| # | 할 일 | 어디서 | 놓치기 쉬운 것 |
|---|---|---|---|
| 1 | Apple ID 추가 | Xcode → Settings → Accounts | — |
| 2 | 서명 켜기 | `npm run cap:ios` → App 타깃 → Signing & Capabilities → Team + **Automatically manage signing** | 인증서·프로파일이 **이때** 생긴다. 번들 ID `app.loveplace`도 자동 등록 |
| 3 | 앱 레코드 생성 | appstoreconnect.apple.com → 앱 → `+` | 앱 **이름은 전역 고유**. 아래 이름/부제를 쓴다 |
| 4 | 계약 확인 | App Store Connect → 비즈니스 | 무료 앱 계약이 '활성'이어야 빌드가 뜬다 |
| 5 | API 키 발급 | 사용자 및 액세스 → 통합 → App Store Connect API | 역할 **App Manager**. `.p8`는 **한 번만** 받을 수 있다 |

**앱스토어에 넣을 이름**(이름 30자·부제 30자, 각각 별도 필드):
```
이름  Weave — 커플 여행 지도        ← 고유성 + 검색 키워드(커플·여행·지도)
부제  걸은 만큼 남는 커플 지도       ← 뭘 하는 앱인지
```
`Weave` 단독은 흔한 단어라 선점됐을 가능성이 크다. 한국어 키워드를 붙이면 고유성과 ASO를 같이 얻는다.

5번 뒤:
```bash
mkdir -p ~/.appstoreconnect/private_keys
mv ~/Downloads/AuthKey_*.p8 ~/.appstoreconnect/private_keys/
cp .env.release.example .env.release   # ASC_KEY_ID / ASC_ISSUER_ID 채우기
```

**그 다음부터는 한 명령**

```bash
npm run release:ios          # 게이트 → 빌드번호 증가 → build:native → 아카이브 → 업로드
npm run release:ios -- --dry # 업로드 직전까지만
npm run release:ios -- --fast # 게이트 생략(직전에 통과했을 때만)
```

스크립트가 대신 기억하는 것 — 이 셋은 **조용히** 틀린다:
- `build:native`를 빼먹으면 **옛 웹 번들**이 그대로 올라간다(빌드는 성공한다).
  특히 `npm run e2e`가 `dist`를 e2e 빌드로 덮으므로, 게이트 **뒤에** 다시 빌드해야 한다.
- 빌드 번호를 안 올리면 업로드가 거부된다(같은 번호 재업로드 금지).
- 시뮬레이터 destination으로는 Archive가 안 된다 → `generic/platform=iOS`.

**테스터 초대**: TestFlight → 내부 테스팅 그룹(최대 100명)에 추가. **베타 심사 없음** —
업로드 후 처리(5~30분)만 끝나면 바로 설치된다. 외부 테스터는 첫 빌드에 심사(1~2일)가 붙으니
둘이 쓸 거면 반드시 내부로.

**빌드는 90일 뒤 만료**된다 — 그때 같은 명령을 다시 돌리면 된다.

#### 막히는 자리: "무료(개인) 팀으로 서명되고 있습니다"

가입비를 냈는데도 Xcode가 무료 팀으로 서명하는 일이 흔하다(가입 처리에 24~48시간).
증상은 export 단계의 이 에러인데, 원인이 서명 설정처럼 보여서 한참 헤매게 된다:

```
No signing certificate "iOS Distribution" found
Team "..." does not have permission to create "iOS App Store" provisioning profiles.
```

**결정적 판별법: 프로비저닝 프로파일 유효기간.** 무료 팀은 **7일**, 유료는 1년이다.

```bash
cd ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/
security cms -D -i *.mobileprovision | plutil -p - | grep -E 'Name|ExpirationDate|CreationDate'
```

`release-ios.mjs`의 사전 점검이 이걸 자동으로 보고 아카이브 전에 멈춘다.

확인 순서: ① developer.apple.com/account → Membership이 Active인지 ② "Welcome to the
Apple Developer Program" 메일이 왔는지 ③ 동의 대기 중인 License Agreement가 있는지
④ 결제한 Apple ID와 Xcode 로그인 Apple ID가 같은지.

## 5. 법무 (영리 출시)
- **개인정보처리방침** `docs/legal/privacy-policy.md` → 공개 URL 호스팅 → 스토어 등록.
- **위치기반서비스사업 신고**(동선 기록/R6 시): [emsit.go.kr](https://www.emsit.go.kr/cp/cv/Cp1440000_0182_01Reg.do), 소상공인 간이신고 가능. **위치정보처리방침** `docs/legal/location-policy.md` 게시 + 위치정보관리책임자 지정.
- 회사 재직 중이면 **취업규칙 겸업금지** 확인.

## 6. 스토어
- iOS: Archive → TestFlight → App Store Connect(스크린샷·설명·개인정보처리방침 URL·App Privacy 라벨) → 심사.
- R6(백그라운드 위치) 출시 시: iOS WhenInUse 목적문자열·5.1.5 소명(우리 설계는 Always 미사용) / 본 설계는 Android **foreground-service만** 써서 Play 배경위치 선언을 회피(앱 스와이프 후 지속이 꼭 필요해지면 그때만 선언서+30초 데모영상).
- 4.8 Sign in with Apple: 구글 로그인과 함께 제공(코드 반영됨) — Apple provider 설정만 하면 됨.

## 7. R6 동선 기록 — 출시 차단 체크리스트 (공개 배포 전 전부 충족)
코드는 완료(0016/0017 마이그레이션·동의·세션·recap·철회·네이티브 래퍼). **아래는 출시 게이트**:
- [ ] **위치기반서비스사업 신고**(방통위 emsit.go.kr) 완료 + `docs/legal/location-policy.md` 공개 게시 + 위치정보관리책임자 지정(처리방침 `[ ]` 채우기). **신고 전 스토어 제출 금지.**
- [ ] **마이그레이션 적용**: `supabase db push`(0016 테이블/RLS/realtime, 0017 RPC). 적용 후 `supabase gen types`로 `database.types.ts` 갱신.
- [ ] **Vault 좌표 키 교체**: `loc_point_key`를 placeholder→실제 32B 키로(Studio/`vault.create_secret`). 키는 절대 클라/깃에 두지 않음.
- [ ] **pg_cron 등록**: `select cron.schedule('purge-loc-access','0 4 * * *', $$ select public.purge_expired_access_log(); $$);` (확인자료 6개월 만료 자동 파기).
- [ ] **Edge Function 배포**: `supabase functions deploy location-purge`(철회=하드파기, SUPABASE_SERVICE_ROLE_KEY 필요). CORS `ALLOWED_ORIGINS`에 배포 도메인 추가.
- [ ] **네이티브 플러그인**: `npm i @transistorsoft/capacitor-background-geolocation` → `cap sync`. iOS Info.plist `NSLocationWhenInUseUsageDescription`·Background Modes(Location), Android foreground-service(type=location)·**배경위치 권한 미선언**. **Android release는 transistorsoft 유료 라이선스**(앱당 1회) 또는 capgo 폴백.
- [ ] **이용약관**에 위치정보법 제18(수집·이용)·19(제3자 제공·통보)·24(철회·중지)조 항목 명시(보존기간 6개월·통보방식·철회).
- [ ] **관리적 보호조치 문서**(제16조): 위치정보 취급대장·접속기록 보관·정기 자체점검 절차 — 신고 시 증빙 첨부.
