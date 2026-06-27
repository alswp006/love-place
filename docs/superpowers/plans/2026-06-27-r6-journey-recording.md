# R6 — GPS 여행 동선 기록 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** "여행 시작~종료" 탭 사이에만 GPS 동선을 샘플링해 암호화 저장하고, 기존 recap 폴리라인에 실측 경로로 연결한다 — 위치정보법 6대 수용기준(설계 §5)을 코드로 못박은 채.

**Architecture:** Capacitor(transistorsoft) bg-geo → 오프라인 큐 → `record_points` RPC(좌표 pgcrypto 암호화 + 확인자료 COLLECT 원자기록) → `route_points`. 읽기는 `get_session_points` RPC(복호). Recap은 `useRecordedRoute` + Douglas–Peucker로 폴리라인. 동의 4종/일시중지/철회는 `consent_log` + 컨트롤 센터, 철회=하드파기(`purge_location_data`). 설계서: `docs/superpowers/specs/2026-06-27-r6-journey-recording-design.md`.

**Tech Stack:** Supabase(Postgres/pgcrypto/Vault/RLS/Realtime/pg_cron), React+TS strict, TanStack Query, Capacitor 8 + `@transistorsoft/capacitor-background-geolocation`, vitest, Playwright.

**결정(소유자 확정):** transistorsoft · pgcrypto 컬럼 암호화 · **리캡 전용(실시간 제외)** · 확인자료 보존 6개월 · 신고는 병렬.

**환경 제약:** 네이티브 디바이스 빌드(transistorsoft pod 설치·iOS/Android 실행)는 맥+`cap add`+라이선스가 필요 → 본 플랜에서 **네이티브 래퍼는 코드+모킹 단위테스트까지** 작성하고, 실기기 검증은 [너] 단계로 표시(Task 14·15). 나머지(DB·RPC·동의·recap·파기·로직·테스트)는 전부 이 환경에서 빌드·검증한다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `supabase/migrations/0016_route_recording.sql` | 4테이블 + RLS + realtime + 트리거 |
| `supabase/migrations/0017_route_crypto_rpc.sql` | Vault 키 + `record_points`/`get_session_points`/`purge_location_data`/`purge_expired_access_log` RPC |
| `src/lib/recap/simplify.ts` | Douglas–Peucker 다운샘플(순수) |
| `src/lib/recap/routeStats.ts` | `recordedDistanceKm`, `orderedRoute` (순수) |
| `src/lib/journey/types.ts` | RoutePoint/TripSession/Consent 타입 + zod 파서 |
| `src/lib/journey/recorder.ts` | transistorsoft 래퍼(start/stop/onLocation) + 플랫폼 가드 |
| `src/lib/journey/pointQueue.ts` | IndexedDB 오프라인 큐(멱등 client_point_id) |
| `src/hooks/useConsent.ts` | consent_log 조회/기록(4종) |
| `src/hooks/useTripSession.ts` | 세션 시작/종료/일시중지 mutation(낙관적 락) |
| `src/hooks/useRecordedRoute.ts` | get_session_points 쿼리 + realtime 무효화 |
| `src/hooks/useLocationWithdraw.ts` | 철회→purge RPC |
| `src/components/journey/ConsentSheet.tsx` | 4종 동의 시트(기본 OFF, 분리 토글) |
| `src/components/journey/RecordingBadge.tsx` | "기록 중" 인디케이터(색+라벨+aria-live) |
| `src/pages/us/LocationControlCenter.tsx` | 일시중지/철회/동의관리(≤2탭) |
| `src/pages/RecapPage.tsx` | recorded 폴리라인 우선 결선 |
| `src/hooks/useTripRecap.ts` | useRecordedRoute 병행 |
| `capacitor.config.ts` / `ios/`·`android/` 매니페스트 | 권한·plist(네이티브, Task 14) |

---

## Task 1: 0016 마이그레이션 — 테이블·RLS·realtime

**Files:** Create `supabase/migrations/0016_route_recording.sql`; Test `src/__tests__/migration0016.test.ts`(파일 정합 검증)

- [ ] **Step 1:** 설계 §3.5 기반으로 `0016_route_recording.sql` 작성하되 아래로 수정:
  - `route_points`: `lat_enc bytea NOT NULL, lng_enc bytea NOT NULL` (평문 컬럼 없음). client INSERT GRANT **주지 않음**(insert는 Task 5 RPC 경유). SELECT도 직접 막고 RPC 경유(GRANT SELECT 제외) — 단 realtime은 publication으로 별도.
  - `trip_sessions`/`consent_log`/`location_access_log`: GRANT + RLS는 설계대로. `location_access_log`은 SELECT/INSERT만(UPDATE/DELETE 정책 없음=불가).
  - `pgcrypto` EXTENSION 생성, 모든 테이블 `touch_updated_at` 트리거(point 제외 가능), realtime publication에 `trip_sessions`만 추가(route_points는 암호화라 payload 무의미 → 클라가 RPC 재조회; **trip_sessions 변경=세션 상태 신호로 충분**).
  - 멱등: `CREATE TABLE IF NOT EXISTS` 안 씀(신규) — 단 `DROP POLICY IF EXISTS` 후 `CREATE POLICY`로 재적용 안전성 확보(0012 패턴).
- [ ] **Step 2:** `migration0016.test.ts` — 파일을 읽어 (a) 4테이블 CREATE 존재 (b) 각 테이블 `ENABLE ROW LEVEL SECURITY` (c) `route_points`에 평문 `lat `/`lng ` 컬럼 없음(`lat_enc`/`lng_enc`만) (d) `location_access_log`에 UPDATE/DELETE POLICY 없음 — 정규식 검증.
- [ ] **Step 3:** `npm run test -- migration0016` → PASS.
- [ ] **Step 4:** Commit `feat(r6): 0016 동선 기록 테이블+RLS+realtime`.

## Task 2: 0017 — Vault 키 + 암호화 RPC

**Files:** Create `supabase/migrations/0017_route_crypto_rpc.sql`; Test `src/__tests__/migration0017.test.ts`

- [ ] **Step 1:** 작성:
  - `vault.create_secret('<32B 랜덤>', 'loc_point_key')` 안내 주석(실제 키는 `supabase secrets`/Vault UI로; 마이그레이션엔 placeholder + IF NOT EXISTS 가드).
  - `record_points(p_session uuid, p_points jsonb)` `SECURITY DEFINER`: ① 세션이 `current_couple_id()` 소속 & `status='RECORDING'` 검증(아니면 raise) ② 각 점 `pgp_sym_encrypt(lat::text, key)` → insert `ON CONFLICT (session_id, client_point_id) DO NOTHING`(멱등) ③ `point_count` 증가 ④ `location_access_log(COLLECT, retain_until=now()+'6 months')` 1행(배치당). 키는 `vault.decrypted_secrets`에서 read.
  - `get_session_points(p_session uuid)` `SECURITY DEFINER`: 세션 couple 검증 후 `pgp_sym_decrypt`로 `{recorded_at, lat, lng, accuracy_m}[]` 반환(recorded_at asc).
  - `purge_location_data(p_session uuid)` / `purge_expired_access_log()`: 설계 §3.5 그대로(service_role 전용).
  - GRANT EXECUTE: `record_points`,`get_session_points` → authenticated; purge 2종 → service_role.
- [ ] **Step 2:** `migration0017.test.ts` — RPC 4개 정의 + `record_points`에 `pgp_sym_encrypt` + `location_access_log` insert + `ON CONFLICT` 존재, purge 2종 `GRANT ... service_role` 검증.
- [ ] **Step 3:** `npm run test -- migration0017` → PASS. **Commit.**

## Task 3: 순수 로직 — simplify (Douglas–Peucker)

**Files:** Create `src/lib/recap/simplify.ts`, `src/__tests__/simplify.test.ts`

- [ ] **Step 1:** 테스트: 일직선상 3점 → 중간점 제거(2점); 임계 ε 작으면 보존; 빈/1점 그대로; 큰 배열 단조 감소.
- [ ] **Step 2:** `simplifyPath(points: {lat;lng}[], epsilonMeters=8): {lat;lng}[]` 구현(수직거리=haversine 근사, 재귀 DP).
- [ ] **Step 3:** test PASS. **Commit.**

## Task 4: 순수 로직 — routeStats

**Files:** Create `src/lib/recap/routeStats.ts`, `src/__tests__/routeStats.test.ts`

- [ ] **Step 1:** 테스트: `recordedDistanceKm(points)` = 연속 점 haversine 누적; `orderedRoute(points)` = recorded_at asc 정렬·중복(같은 client_point_id) 제거; 빈 배열 0.
- [ ] **Step 2:** 구현(`haversineKm`는 `recapStats.ts`에서 재사용 import).
- [ ] **Step 3:** test PASS. **Commit.**

## Task 5: 타입 + zod 파서

**Files:** Create `src/lib/journey/types.ts`, `src/__tests__/journeyTypes.test.ts`

- [ ] **Step 1:** 테스트: `parseRoutePoint`가 RPC 반환(JSON)·잘못된 lat 범위 거부; `ConsentType` 유니온; `TripSession` status 유니온.
- [ ] **Step 2:** zod 스키마 + `z.infer` 타입(`RoutePoint`,`TripSession`,`ConsentRecord`,`ConsentType`). 외부응답 경계 파싱(web-stack §1).
- [ ] **Step 3:** test PASS. **Commit.**

## Task 6: 오프라인 점 큐 (IndexedDB)

**Files:** Create `src/lib/journey/pointQueue.ts`, `src/__tests__/pointQueue.test.ts`

- [ ] **Step 1:** 테스트(fake-indexeddb): enqueue→pending 반환; flush 성공 시 제거; 실패 시 보존; `client_point_id` 멱등(중복 enqueue 1건). 유실 0·중복 0.
- [ ] **Step 2:** `enqueuePoint`, `pendingPoints(sessionId)`, `flush(sessionId, sender)` — sender는 `record_points` 호출자 주입(테스트 모킹).
- [ ] **Step 3:** test PASS. **Commit.**

## Task 7: useConsent — 4종 동의

**Files:** Create `src/hooks/useConsent.ts`, `src/__tests__/useConsent.test.tsx`

- [ ] **Step 1:** 테스트: 4종 기본 미동의(빈 consent_log) → 모두 false; `grant(type,{scope,notifyMode})` insert 1행(append, policy_version 포함); `withdraw(type)` insert granted=false; `COLLECT_USE` 없으면 `canRecord=false`.
- [ ] **Step 2:** 구현 — `['consent', userId]` 쿼리(최신 per type), `grant`/`withdraw` mutation(`consent_log` insert, `shown_text_hash` 인자), 파생 `canRecord`/`canProvide`. **다크패턴 금지: 기본 OFF.**
- [ ] **Step 3:** test PASS. **Commit.**

## Task 8: useTripSession — 시작/종료/일시중지

**Files:** Create `src/hooks/useTripSession.ts`, `src/__tests__/useTripSession.test.tsx`

- [ ] **Step 1:** 테스트: `start()`는 `canRecord=false`면 throw(동의 게이트, 설계 §5[2]); 성공 시 trip_sessions insert status=RECORDING; `pause()`/`end()`는 `version` 조건부 update, 0행=충돌 표시(LWW 금지); end는 `recorded_distance_m`/`ended_at` 세팅.
- [ ] **Step 2:** 구현(TanStack mutation, 낙관적+롤백, `['trip-session', coupleId, tripId]`).
- [ ] **Step 3:** test PASS. **Commit.**

## Task 9: useRecordedRoute — 읽기 + realtime

**Files:** Create `src/hooks/useRecordedRoute.ts`, `src/__tests__/useRecordedRoute.test.tsx`

- [ ] **Step 1:** 테스트: `get_session_points` RPC mock → ordered+simplified 폴리라인 반환; trip_sessions realtime 변경 시 invalidate(채널 cleanup 확인); 점 없으면 `[]`.
- [ ] **Step 2:** 구현 — `['recorded-route', coupleId, sessionId]`, `supabase.rpc('get_session_points')`, parse→orderedRoute→simplifyPath. realtime은 `trip_sessions` 구독→invalidate(web-stack §4.3 패턴, payload 직접 머지 금지).
- [ ] **Step 3:** test PASS. **Commit.**

## Task 10: useLocationWithdraw — 철회=하드파기

**Files:** Create `src/hooks/useLocationWithdraw.ts`, `src/__tests__/useLocationWithdraw.test.tsx`

- [ ] **Step 1:** 테스트: `withdraw(sessionId)` → recorder.stop() 호출 + `purge_location_data` RPC(Edge Function 경유, service_role) + consent withdraw + 캐시 무효화. 설계 §5[3][4].
- [ ] **Step 2:** 구현 — purge는 클라가 service_role 못 쓰므로 **`location-purge` Edge Function**(JWT 검증→세션 couple 확인→`purge_location_data` 호출) 경유. 본 태스크에 Edge Function 스텁 포함(`supabase/functions/location-purge/index.ts`, 미들웨어 재사용).
- [ ] **Step 3:** test PASS. **Commit.**

## Task 11: 제3자 제공 로그 + 통보

**Files:** Modify `src/hooks/useRecordedRoute.ts`(상대 동선 열람 시), Create `src/lib/journey/provideLog.ts`, `src/__tests__/provideLog.test.ts`

- [ ] **Step 1:** 테스트: 내가 **상대의** 세션을 열람 → `location_access_log(PROVIDE, data_subject=상대, recipient=나)` 1행 + 통보(인앱 활동 피드 enqueue: 즉시 or 30일배치, consent `NOTIFY_METHOD`에 따름). 내 세션 열람은 PROVIDE 기록 안 함.
- [ ] **Step 2:** 구현 — `logProvideIfPartner(session, viewer)` (access_log insert; 통보는 기존 활동피드 테이블에 enqueue). 설계 §5[3].
- [ ] **Step 3:** test PASS. **Commit.**

## Task 12: 동의 UI + 컨트롤 센터 + 기록 배지

**Files:** Create `ConsentSheet.tsx`, `RecordingBadge.tsx`, `LocationControlCenter.tsx`(+ `/us` 라우트 링크); Test `src/__tests__/consentSheet.test.tsx`, `locationControlCenter.test.tsx`

- [ ] **Step 1:** 테스트: ConsentSheet 4종 분리 토글·기본 OFF·(b)제3자 미동의해도 닫기 가능(핵심기능 비차단); ControlCenter "일시중지" ≤2탭 도달·기록중에도 동작; 배지 색+"기록 중" 텍스트+`aria-live`.
- [ ] **Step 2:** 구현(설계 §4·§7 — 색+라벨 이중화, focus-visible, 다크/Reduce Motion, 빈/에러 상태).
- [ ] **Step 3:** test PASS. **Commit.**

## Task 13: Recap 결선

**Files:** Modify `src/hooks/useTripRecap.ts`, `src/pages/RecapPage.tsx`, `src/__tests__/recapPage.test.tsx`

- [ ] **Step 1:** 테스트: recorded 동선 있으면 폴리라인=recorded(우선), 거리=recordedKm·라벨 "기록"; 없으면 기존 geodesic/snapped fallback·라벨 유지; 둘 다 없으면 빈상태 CTA.
- [ ] **Step 2:** `useTripRecap`에 `useRecordedRoute` 병행, `RecapPage`에서 `recorded ?? snapped ?? geodesic` 우선순위. NaverMap polyline prop 그대로(형태 동일).
- [ ] **Step 3:** test PASS + e2e 스냅샷 재생성(필요시). **Commit.**

## Task 14: 네이티브 래퍼 (코드+모킹테스트, 실기기는 [너])

**Files:** Create `src/lib/journey/recorder.ts`, `src/__tests__/recorder.test.ts`; Modify `capacitor.config.ts`, `package.json`

- [ ] **Step 1:** 테스트(플러그인 mock): web/비네이티브에서 `start()` no-op(가드); 네이티브에서 `BackgroundGeolocation.ready({distanceFilter,locationAuthorizationRequest:'WhenInUse',stopOnTerminate})` + onLocation→enqueuePoint; stop()→removeListeners. WebView fetch 금지(CapacitorHttp/플러그인 큐 사용 주석).
- [ ] **Step 2:** 구현 — transistorsoft 래퍼, 플랫폼 가드(`isNativePlatform`). `package.json`에 `@transistorsoft/capacitor-background-geolocation` 추가(설치는 cap add 시).
- [ ] **Step 3:** test PASS. **Commit.**
- [ ] **Step 4 [너·디바이스]:** `cap add ios/android` → pod/gradle 설치 → Info.plist(`NSLocationWhenInUseUsageDescription` 등 설계 §6)·AndroidManifest(foreground-service type=location, **배경위치 권한 미선언**)·Background Modes → 실기기 동선 캡처 검증.

## Task 15: 출시 게이트 체크리스트 + 정책 값 확정

**Files:** Modify `docs/DEPLOY.md`, `docs/legal/location-policy.md`

- [ ] **Step 1:** DEPLOY.md에 R6 출시 차단 항목(신고 완료·transistorsoft Android 라이선스·약관 제18/19/24조·취급대장/자체점검 문서) 체크리스트 추가.
- [ ] **Step 2:** location-policy `[N]개월`→`6개월` 확정, 통보방식·철회 절차 문구 최종화.
- [ ] **Step 3:** **Commit.**

---

## 최종 게이트 (전 태스크 후)
`tsc` 0 · vitest(파기/동의게이트/멱등/충돌) · build · e2e(시작→기록중→종료→리캡, 라이트/다크, 빈/로딩/에러) · **RLS 격리**(타 couple route_points/세션/확인자료 0건) · 접근성(색+라벨·aria-live·Reduce Motion) · EXIF N/A(발행 무관).

## Self-Review
- **Spec 커버리지:** §3 데이터모델→T1·2; §4 동의→T7·12; §5[1]→T15, [2]→T8, [3]→T11·12, [4]→T2·10, [5]→T2(암호화)·T1(RLS), [6]→전반; §6 네이티브→T14; §8 테스트→각 T + 최종게이트. ✅
- **타입 일관:** `record_points`/`get_session_points`/`purge_location_data` 명칭 T2·5·9·10 일치. `client_point_id` 멱등키 T2·6·一. `canRecord` T7·8 일치.
- **순서:** DB(1·2)→순수로직(3·4·5·6)→훅(7·8·9·10·11)→UI(12·13)→네이티브(14)→출시(15). 각 태스크 독립 테스트·커밋.
