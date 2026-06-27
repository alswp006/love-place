# R6 배포 런북 (복붙용) — DB·Edge Function·네이티브

> 기술 배포(A.1~A.4) 전용. 신고·스토어 등 행정은 docs/DEPLOY.md §5~7 참고. 명령은 2026 기준 검증값이나 키/ref는 본인 값으로.

## 0. 사전 준비 (계정·CLI 설치·프로젝트 링크)

전제: macOS, **Node 22+**(Capacitor 8 필수), **Xcode 26+**, **Android Studio Otter(2025.2.1)+**. iOS 빌드는 Mac 필수.

```bash
node --version    # v22+ 여야 함 (낮으면 cap sync/빌드 실패)
xcodebuild -version   # Xcode 26.0+ (iOS 빌드 시)
```

Supabase CLI는 **전역 설치 불가** — 이 레포의 dev 의존성으로 설치하고 `npx supabase`로 호출(또는 brew).

```bash
cd /Users/minje/Project/love_place
npm install supabase --save-dev
npx supabase --help    # 동작 확인
# (대안) brew install supabase/tap/supabase
```

로그인 + 원격 프로젝트 링크. `<PROJECT_REF>`는 Supabase 대시보드 URL의 20자 ref, `<DB_PASSWORD>`는 프로젝트 DB 비밀번호.

```bash
npx supabase login        # 브라우저로 Personal Access Token 발급
npx supabase link --project-ref <PROJECT_REF> -p '<DB_PASSWORD>'
```

> 확인: 이게 보이면 OK — `npx supabase migration list` 가 에러 없이 Local/Remote 표를 출력한다(링크 성공).

---

## A.1 DB 배포 (마이그레이션 push + Vault 키 + pg_cron) — 0순위

R6 핵심은 **0016/0017** 두 마이그레이션이다. 0016 = 테이블/RLS/realtime, 0017 = 좌표 암호화 RPC + Vault `loc_point_key` 자동 생성 + 파기 함수.

### 1) 무엇이 올라갈지 먼저 dry-run

```bash
cd /Users/minje/Project/love_place
npx supabase db push --dry-run
```

> 확인: 출력에 `0016_route_recording.sql` 과 `0017_route_crypto_rpc.sql` 만(이전 0001~0015는 이미 적용됐으면 안 보임) pending으로 뜨면 OK.

### 2) 실제 push

```bash
npx supabase db push
```

> 확인: `Applying migration 0016_route_recording.sql ... 0017_route_crypto_rpc.sql` 후 에러 없이 종료. 이어서 `npx supabase migration list` 에서 0016/0017이 Remote 열에도 찍히면 OK.

### 3) 확장 활성 (pg_cron만 필요 / pg_net 불필요)

이 두 cron 잡은 **SQL 함수를 직접 호출**(net.http_post 아님)하므로 `pg_net`/Vault-project-url 세팅은 **필요 없다**. `supabase_vault`(좌표 암호화용)는 0017이 `CREATE EXTENSION IF NOT EXISTS supabase_vault`로 이미 처리. pg_cron만 켜면 된다.

Supabase 대시보드 → SQL Editor에서 실행(또는 Database → Extensions에서 `pg_cron` 토글):

```sql
create extension if not exists pg_cron;
```

> 확인: `select extname from pg_extension where extname in ('pg_cron','supabase_vault','pgcrypto');` 가 3행을 반환하면 OK. (pg_cron은 postgres DB에서만 동작.)

### 4) Vault `loc_point_key` — 실제 키 확정 (데이터 기록 전에 단 한 번)

0017이 이미 랜덤 32바이트 키를 `loc_point_key`로 자동 생성한다. **이미 강한 랜덤 키이므로 그대로 써도 된다.** 직접 키를 통제/백업하고 싶으면 **route_points에 데이터가 쌓이기 전에** 아래로 교체하라. (좌표가 한 점이라도 기록된 뒤 키를 바꾸면 기존 좌표 복호 불가 → 영구 손실.)

먼저 존재 확인:

```sql
select name from vault.secrets where name = 'loc_point_key';
```

(선택) 직접 만든 강한 키로 교체 — `<UUID>`는 위 secret의 id, `<64HEX>`는 64자 hex(예: 터미널에서 `openssl rand -hex 32`):

```sql
-- secret UUID 확인
select id, name from vault.secrets where name = 'loc_point_key';
-- 교체 (데이터 기록 전에만!)
select vault.update_secret('<UUID>', '<64HEX>', 'loc_point_key', 'R6 route_points 좌표 대칭암호 키');
```

**키 백업(필수):** 이 값이 사라지면 모든 동선 좌표가 복구 불가. 안전한 곳에 따로 보관.

```sql
select name, decrypted_secret from vault.decrypted_secrets where name = 'loc_point_key';
```

> 확인: `decrypted_secret`이 64자 hex 문자열로 한 줄 보이고, 그 값을 안전한 곳에 백업했으면 OK.

### 5) pg_cron 잡 2개 등록 (파기 자동화 — 위치정보법 보존기간/목적소멸)

0017 주석에 명시된 정본 그대로(job 이름은 case-sensitive·불변):

```sql
select cron.schedule('purge-loc-access',  '0 4 * * *', $$ select public.purge_expired_access_log(); $$);
select cron.schedule('purge-orphan-sess', '0 4 * * *', $$ select public.purge_orphan_sessions(14); $$);
```

> 확인: `select jobname, schedule, active from cron.job;` 가 `purge-loc-access`·`purge-orphan-sess` 두 행(active=t)을 반환하면 OK. 다음날 이후 `select * from cron.job_run_details order by start_time desc limit 5;`로 성공 실행 확인.

잘못 등록했으면(이름/스케줄은 수정 불가) 지우고 다시:

```sql
select cron.unschedule('purge-loc-access');
```

---

## A.2 Edge Function 배포 (시크릿 + deploy)

### 1) 시크릿 설정 (호스티드 런타임 — 즉시 반영, 재배포 불필요)

> **`SUPABASE_SERVICE_ROLE_KEY`는 set 하지 말 것.** `SUPABASE_` 접두는 예약어라 거부되고, `location-purge`의 `adminClient()`는 런타임이 자동 주입한 `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`를 읽는다. 즉 R6 파기 함수는 **추가 키 없이도** 동작한다.

**R6에 직접 필요한 건 `ALLOWED_ORIGINS` 하나.** 네이티브 WebView origin(iOS=`capacitor://localhost`, Android=`https://localhost`)을 CORS 화이트리스트에 넣어야 인앱에서 `location-purge`/검색/길찾기 호출이 통과한다. `<WEB_DOMAIN>`은 배포 웹 도메인(`VITE_PUBLIC_SITE_URL`).

```bash
cd /Users/minje/Project/love_place
npx supabase secrets set ALLOWED_ORIGINS='capacitor://localhost,https://localhost,<WEB_DOMAIN>'
```

나머지 프록시 키들(이미 설정돼 있으면 생략 — `npx supabase secrets list`로 먼저 확인). 레포에서 실제로 읽는 이름만 사용:

```bash
npx supabase secrets list
```

```bash
# 미설정인 것만 채우기 (값은 본인 키로)
npx supabase secrets set \
  ANTHROPIC_API_KEY='<sk-ant-...>' \
  ANTHROPIC_MODEL='<claude-...>' \
  MONTHLY_CAP_AI_ROUTE='<예: 50>' \
  KAKAO_REST_KEY='<카카오 REST 키>' \
  TMAP_APP_KEY='<TMAP 키>' \
  MONTHLY_CAP_DIRECTIONS='<예: 1000>' \
  NAVER_SEARCH_CLIENT_ID='<네이버 검색 ID>' \
  NAVER_SEARCH_CLIENT_SECRET='<네이버 검색 시크릿>' \
  GITHUB_TOKEN='<블로그 발행용 토큰>'
```

> 확인: `npx supabase secrets list` 에 `ALLOWED_ORIGINS`(+필요한 키들)가 보이면 OK. (값은 마스킹되어 digest만 표시.)

### 2) 함수 배포 (Docker 없이 `--use-api`)

R6 핵심인 `location-purge`를 먼저, 이어 `directions`/`ai-route`:

```bash
npx supabase functions deploy location-purge --use-api
npx supabase functions deploy directions --use-api
npx supabase functions deploy ai-route --use-api
```

(전부 한 번에 올리려면 이름 생략: `npx supabase functions deploy --use-api`)

> 확인: 각 명령이 `Deployed Function location-purge ...` 로 끝나고, 인증 없는 POST가 401로 막히면 OK(엔드포인트 보호 동작):
```bash
curl -i -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/location-purge" \
  -H "Content-Type: application/json" -d '{}'
# 기대: HTTP/2 401 (JWT 없음 → 거부)
```

---

## A.3 네이티브 빌드 (transistorsoft + cap add + 권한 + 디바이스)

이 레포는 **백그라운드 위치 플러그인을 일부러 빼놨다(R6 게이트, `capacitor.config.ts` 주석/`hasTransistorsoft:false`).** 이 단계가 게이트를 여는 작업이다.

> 비용 주의: DEBUG/실기기 테스트 빌드는 **iOS·Android 둘 다 무료**(라이선스 키 불필요). **RELEASE(스토어) 빌드는 유료 JWT 라이선스 필요** — 과거엔 "Android만 유료"였으나 transistorsoft v9.0.0(2026-03)부터 **iOS RELEASE도 라이선스 키 필요**. 지금 실기기 스모크는 DEBUG라 키 없이 진행.

> WebView가 백그라운드일 때 JS 타이머/네트워크가 throttle되는 문제는 **앱 코드의 오프라인 큐 + `record_points` 멱등(client_point_id)으로 이미 처리**돼 있다. 별도 작업 불필요.

### 1) 플러그인 설치 + 네이티브 추가

Capacitor 8은 v8.x/9.x 라인 모두 호환.

```bash
cd /Users/minje/Project/love_place
npm install @transistorsoft/capacitor-background-geolocation
```

웹 빌드 산출물(dist) 생성 후 네이티브 프로젝트 추가. (ios/android 폴더가 아직 없음 — `cap add`로 생성)

```bash
npm run build              # tsc --noEmit && vite build
npm run check:secrets      # 번들에 비공개 키 안 샜는지 게이트
npx cap add ios            # v8 기본 SPM. Pods 원하면: npx cap add ios --packagemanager CocoaPods
npx cap add android
npm run cap:sync           # cap sync (플러그인 네이티브 의존성 결선)
```

> 앱 코드에 `ready()`/`start()`/`stop()` 연결이 이미 있어야 함(R6 기능 코드). 없다면 부팅 시 1회 `ready()` + 세션 시작/종료에 `start()`/`stop()`을 호출하고, on-demand·전경 한정으로: `locationAuthorizationRequest:'WhenInUse'`, `stopOnTerminate:true`, `startOnBoot:false`, `distanceFilter:10`, `desiredAccuracy:HIGH`. **`ready()`는 추적을 시작하지 않는다 — `start()` 호출 필수.**

### 2) iOS — Info.plist 권한 문구 + Background Modes

`ios/App/App/Info.plist`에 추가(WhenInUse 전용이라 Always 문구는 불필요, **NSMotion은 필수** — 없으면 SDK 런타임 크래시):

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>여행 동선을 기록하는 동안 위치를 사용합니다.</string>
<key>NSMotionUsageDescription</key>
<string>이동/정지 감지로 배터리를 아끼기 위해 모션 정보를 사용합니다.</string>
```

Xcode에서 Background Modes 추가: 프로젝트 루트 → **Signing & Capabilities → + Capability → Background Modes → [x] Location updates** (잠금/백그라운드에서도 활성 세션 위치 수신에 필수).

### 3) Android — 배경위치 권한 미선언 + 전경 서비스 + (RELEASE만) 라이선스

`android/app/src/main/AndroidManifest.xml`의 `<manifest>`에 `xmlns:tools` 추가하고, SDK가 자동 병합하는 **ACCESS_BACKGROUND_LOCATION을 제거**(WhenInUse 전용 유지 → Play 배경위치 심사 회피). 전경 서비스/위치 권한은 SDK가 자동 병합하므로 직접 선언하지 말 것.

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
          xmlns:tools="http://schemas.android.com/tools">
  <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" tools:node="remove" />
  ...
</manifest>
```

`android/variables.gradle` 확인(최소값): `minSdkVersion = 24`, `playServicesLocationVersion = '21.3.0'` (compile/target SDK는 Capacitor 8 기본 36이면 transistorsoft 요건 충족). `android/app/build.gradle`의 release buildType에 **`shrinkResources false`**(아니면 SDK 리소스가 제거돼 빌드 깨짐).

RELEASE 빌드를 만들 때만 — `<application>` 안에 라이선스 메타데이터(`<JWT_LICENSE>`는 Customer Dashboard에서 발급한 Capacitor 제품용 키):

```xml
<meta-data android:name="com.transistorsoft.locationmanager.license" android:value="<JWT_LICENSE>" />
```

### 4) 아이콘/스플래시 생성 + IDE 열기 + 서명

```bash
cd /Users/minje/Project/love_place
npm run generate:assets    # capacitor-assets generate (assets/logo.png >=1024 필요)
npm run build:native       # vite build && cap sync (웹 변경분 반영)
npm run cap:ios            # Xcode 열기 (App.xcworkspace)
npm run cap:android        # Android Studio 열기
```

- iOS 서명: Xcode → App 타깃 → Signing & Capabilities → **Automatically manage signing** 체크 → Team에 본인 Apple ID(무료 Personal Team이면 실기기 테스트 가능, 7일 만료) → Bundle Identifier = `app.loveplace`.
- 첫 실기기 실행 후 iPhone: 설정 → 일반 → VPN 및 기기 관리에서 개발자 인증서 신뢰.

### 5) 실기기 실행

```bash
cd /Users/minje/Project/love_place
npx cap run ios        # 페어링된 iPhone 선택
# 또는
npx cap run android    # USB 디버깅 켠 기기/에뮬레이터
```

> 실기기 스모크: 권한 프롬프트 허용(위치=앱 사용 중, 모션, Android 13+ 알림) → 기록 **시작** 누르고 → 밖에서 좀 걷고 → **종료** → 리캡 화면 지도에 동선 **선(폴리라인)이 그려지면 OK.** 상대 계정으로 그 세션을 열었을 때도 선이 보이면 제3자 제공 RPC까지 통과.

---

## A.4 Supabase Auth (Apple/Google provider)

대시보드 작업. **Authentication → Sign In / Providers**에서:

- **Google**: 토글 ON → Google Cloud OAuth client의 `Client ID`/`Client Secret` 입력.
- **Apple**: 토글 ON → Apple Services ID(`Client IDs`)와 키 입력.
- 공통 콜백 URL을 각 제공자 콘솔의 Authorized redirect에 등록:
  ```
  https://<PROJECT_REF>.supabase.co/auth/v1/callback
  ```

**Authentication → URL Configuration**의 Redirect URLs(allowlist)에 네이티브/웹 origin 추가(클라이언트가 `detectSessionInUrl:true`로 콜백 처리):

```
capacitor://localhost
https://localhost
<WEB_DOMAIN>
```

> 확인: 실기기 앱에서 Google/Apple 로그인 → `/auth` 콜백 후 세션 생성되고, couple 연결 상태면 탭으로 진입하면 OK.

---

## 마지막: 전체 스모크 체크리스트 (push → 배포 → 디바이스)

push(DB):
- [ ] `npx supabase migration list` → 0016/0017이 Remote에 적용됨
- [ ] `select name from vault.secrets where name='loc_point_key';` → 1행 (그리고 키 값 백업 완료)
- [ ] `select jobname,active from cron.job;` → `purge-loc-access`, `purge-orphan-sess` active=t

배포(Edge):
- [ ] `npx supabase secrets list` → `ALLOWED_ORIGINS`(네이티브 origin 포함) 존재
- [ ] `location-purge`/`directions`/`ai-route` Deployed
- [ ] 무인증 `POST /functions/v1/location-purge` → **401**

디바이스(R6 본 기능):
- [ ] 권한 허용(위치=앱 사용 중·모션·알림)
- [ ] 기록 시작 → 이동 → 종료 → **리캡에 동선 선이 보임**
- [ ] 상대 계정으로 같은 세션 열람 시 선이 보임(제공 동의 통과)
- [ ] 동의 철회/세션 파기 시 `location-purge` 호출 후 좌표가 사라짐(복구 불가)
