# love_place — 패킷 계획 (04-tasks.md)

> 소스 오브 트루스: `여행관리앱_설계서.md`. 이 문서는 그 설계서를 **구현 계약**으로 증류한 패킷 단위 작업 계획이다.
> 확정 스택: **웹앱(React + Vite + TS, PWA) + Supabase(Postgres/Auth/RLS/Realtime/Storage/Edge Functions)**. 설계서 §2 선행 게이트를 '웹앱'으로 해소 — 이 결정에 반하는 작업 금지.
> 규약(전 패킷 적용): TS strict / API 키 클라이언트 절대 금지(전부 Edge Function 프록시) / RLS 전 테이블 / soft-delete + version 낙관적 락 + 오프라인 큐 / 색만으로 상태 구분 금지(색+패턴/라벨) / VoiceOver·Dynamic Type·Reduce Motion·다크모드 기본 / 빈 상태·로딩 디테일 / 게이트: `tsc` 0 + `vitest` + `build` + Playwright 비주얼 스모크.
> 각 패킷은 **코딩 세션 1회분**으로 잘게 쪼갰다(P0a, P0b …). DoD는 설계서 §9.1 합격선을 반영.

---

## 폴더 구조 (기준)

```
src/{pages, components, lib(supabase·kakao·anthropic-types·utils), hooks, state, styles, __tests__}
supabase/{migrations, functions/<edge-fn>}
e2e/         (Playwright 비주얼 스모크)
public/      (PWA manifest·아이콘·service worker)
```

---

# P0 — 토대 (Foundation)

설계서 §2, §2.1, §4.1, §4.2, §10.1~10.3. DoD(단계 0): **둘이 연결 + RLS 격리 확인 + 프록시 인증·상한 동작 + 내보내기 v0**.

## P0a — 스캐폴드 + PWA + CI

- **범위:** Vite+React+TS strict 스캐폴드, ESLint/Prettier, vitest 셋업, Playwright 설치, PWA(manifest+아이콘+서비스워커, 홈화면 추가), 라우터(5탭 IA 골격: 지도/일정/장소/추천/우리 — §3), 다크모드/Reduce Motion 토큰, GitHub Actions CI.
- **산출:** `package.json`, `vite.config.ts`, `tsconfig.json`(strict), `.eslintrc`, `public/manifest.webmanifest`, `public/sw.js`(또는 vite-plugin-pwa), `src/main.tsx`, `src/App.tsx`, `src/pages/{MapPage,CalendarPage,PlacesPage,RecommendPage,UsPage}.tsx`(빈 셸), `src/styles/tokens.css`, `.github/workflows/ci.yml`.
- **의존성:** 없음(루트).
- **DoD:** `tsc` 0 / `vitest` 통과(스모크 1개) / `build` 성공 / Playwright가 5탭 셸 렌더 스냅샷 / CI 4게이트 그린 / iOS Safari에서 '홈 화면에 추가' 동작.
- **테스트:** 라우팅 스모크, manifest 유효성, 다크/라이트 토큰 스냅샷.

## P0b — Supabase 프로젝트 + Auth + 클라이언트

- **범위:** Supabase 프로젝트 연결, Auth(매직링크 또는 OAuth — 2인이라 단순, §2 인증), 클라이언트 싱글톤, 세션 훅, 보호 라우트, 로그인/콜백 페이지.
- **산출:** `src/lib/supabase/client.ts`, `src/hooks/useSession.ts`, `src/state/auth.ts`, `src/pages/LoginPage.tsx`, `.env.example`(anon key만 — service key 절대 클라이언트 금지), `supabase/config.toml`.
- **의존성:** P0a.
- **DoD:** 매직링크 로그인→세션 유지→로그아웃 / 미인증 시 보호 라우트 차단 / anon key 외 키 클라이언트 번들에 없음(검증).
- **테스트:** 세션 훅 단위 테스트(모킹), 보호 라우트 리다이렉트 e2e.

## P0c — 데이터 모델 마이그레이션 + 감사/동기화 필드 + regions 시드

- **범위:** 전 테이블 DDL(`couples, profiles, regions, places, wishes, visits, trips, photos, events, itineraries, reactions`). **모든 공유 테이블에 `couple_id` + 감사/동기화 표준 필드** `created_at, updated_at, created_by, updated_by, deleted_at, version`(§4.3). 제약: `places.kakao_place_id` UNIQUE per couple, `region_code` FK, `trips.cover_photo_id` FK(같은 couple, 삭제 시 null 폴백 트리거), `events.reminders` jsonb, `recurrence_rule` 컬럼. `version` 자동증가 트리거, `updated_at` 트리거. regions 마스터 시드(법정동 b_code 접두 — 최소 광역+주요 시군구).
- **산출:** `supabase/migrations/0001_core_schema.sql`, `0002_audit_sync_fields.sql`, `0003_triggers_version_updatedat.sql`, `0004_regions_seed.sql`, `src/lib/types/db.ts`(생성된 타입 또는 수기 타입).
- **의존성:** P0b.
- **DoD:** 마이그레이션 적용 성공 / 스키마가 §4.1 ERD와 1:1(snake_case) / `version` 증가·`updated_at` 갱신 트리거 동작 / cover_photo 삭제 시 null 폴백 / kakao_place_id 중복 거부.
- **테스트:** SQL 단위(pgTAP 또는 vitest+직접 쿼리): 트리거 동작, UNIQUE 위반, FK 위반, 커버사진 폴백.

## P0d — couples 초대·연결 (1회용 만료 코드, 1:1 바인딩)

- **범위:** 커플 생성(PENDING+초대코드 발급), 초대코드 수락→`user_b`·각 `profiles.couple_id` 채움→`status=ACTIVE`(§4.2 생성 순서). 1회용·만료·충분 엔트로피 코드, **1:1 바인딩**(제3자/다자 차단), 멤버 ≤2 앱 레이어 강제, 멤버십 정본=`couples.user_a/user_b`(profiles.couple_id는 캐시). 연결 관리 UI(우리 탭).
- **산출:** `supabase/functions/couple-invite/index.ts`(코드 발급), `supabase/functions/couple-accept/index.ts`(검증·바인딩, 만료/재사용/3인 거부), `src/pages/us/ConnectPage.tsx`, `src/hooks/useCouple.ts`, `src/lib/utils/inviteCode.ts`.
- **의존성:** P0c.
- **DoD:** 둘이 연결되어 `status=ACTIVE` / 만료코드·재사용·3번째 가입 거부 / 정본/캐시 어긋나면 couples 신뢰.
- **테스트:** 초대→수락 해피패스, 만료, 재사용, 3인 차단, 동시 수락 경쟁.

## P0e — RLS 골격 (couple_id + visibility 다단계)

- **범위:** 전 공유 테이블에 **`couple_id = 호출자 couple_id`** 정책 + `events.visibility`(PERSONAL/SHARED) 다단계 + soft-delete 가시성(`deleted_at IS NULL` 기본). 호출자 couple_id 해석 헬퍼(SECURITY DEFINER 함수). §10.2.
- **산출:** `supabase/migrations/0005_rls_policies.sql`, `0006_rls_helpers.sql`, `src/__tests__/rls.spec.ts`.
- **의존성:** P0c, P0d.
- **DoD:** **RLS 격리 확인** — 커플 A가 커플 B 데이터 조회/수정 0건 / PERSONAL 일정은 같은 커플 내 양측 가시(색만 갈림, §4.2) / 타 커플엔 불가 / soft-deleted 행 기본 비노출.
- **테스트:** 두 커플 픽스처로 교차 접근 차단(select/insert/update/delete), visibility 매트릭스, soft-delete 가시성.

## P0f — Edge Function 프록시 스켈레톤 (인증·레이트리밋·상한)

- **범위:** 공용 프록시 미들웨어 — **Supabase JWT 검증**(호출자 인증, §2.1), 엔드포인트별 분/일 레이트리밋, **월 사용량/비용 상한**(특히 Claude), 상한 초과 친절 거절, 결과 캐싱 골격(짧은 TTL=자동완성·장기=AI). 사용량 카운터 테이블.
- **산출:** `supabase/functions/_shared/auth.ts`, `_shared/ratelimit.ts`, `_shared/usage.ts`(월 상한), `_shared/cache.ts`, `supabase/migrations/0007_usage_counters.sql`, 헬스 엔드포인트 `supabase/functions/proxy-health/index.ts`.
- **의존성:** P0b, P0c.
- **DoD:** **프록시 인증·상한 동작** — 무토큰/타 JWT 거절 / 레이트리밋 429 / 월 상한 초과 거절 / 캐시 히트 동작.
- **테스트:** 인증 거절, 레이트리밋 경계, 상한 초과, 캐시 히트/미스.

## P0g — 내보내기 v0 (JSON 덤프)

- **범위:** 설계서 §9.1 단계0 산출물 — 커플 전체 데이터 JSON 덤프(전 테이블, soft-deleted 포함 옵션). §10.4 관계종료 대비 1차 형태. 우리 탭에서 다운로드.
- **산출:** `supabase/functions/export-json/index.ts`, `src/pages/us/ExportPage.tsx`, `src/lib/export/dumpSchema.ts`.
- **의존성:** P0e.
- **DoD:** JSON 덤프가 커플 전 테이블 포함 / RLS 통과(자기 커플만) / 스키마 안정(버전 필드).
- **테스트:** 덤프 스키마 스냅샷, 타 커플 데이터 미포함.

---

# P1 — MVP 핵심 루프 (위시 장소 + 지도)

설계서 §5.2, §5.5, §4.3. DoD(단계 1): **장소 저장 ≤3탭 & 자동완성 체감 ≤400ms & 약전파 데이터 유실 0**. 횡단 테스트(동기화/충돌/오프라인)는 **여기서부터** 필수.

## P1a — 네이버 지역검색 프록시 + 자동완성 훅

- **범위:** Edge Function이 네이버 지역검색 프록시(키 서버 보관; 함수명 `kakao-search` 유지 — D5, 배포 경로 호환). 클라이언트 자동완성 훅: **디바운스 250ms**, **취소 토큰으로 stale 응답 무시**(race 방지, §5.2), 결과 0건→직접입력 폴백, 오프라인/타임아웃→인라인 에러+재시도+입력 보존.
- **산출:** `supabase/functions/kakao-search/index.ts`(P0f 미들웨어 사용), `src/hooks/useKakaoSearch.ts`, `src/lib/kakao/types.ts`, `src/components/places/SearchAutocomplete.tsx`.
- **의존성:** P0f.
- **DoD:** 자동완성 응답 **체감 ≤400ms**(짧은 TTL 캐시 포함) / stale 응답 폐기 / 0건·오프라인 폴백.
- **테스트:** 디바운스 타이밍, 취소토큰 race, 0건 폴백, 캐시 히트.

## P1b — 장소 저장 (places + wishes, 중복 점프)

- **범위:** 후보 선택→`places`(공유: name·address·region_code·region_label·lat·lng·category·kakao_place_id·added_by) + 누른 사람의 `wishes`(user_id·priority 하트) 저장. 카카오 주소 파싱→region_code/label 자동 채움(§4.2). **중복=kakao_place_id**면 기존 카드로 점프하고 내 wish만 추가(§5.2). 저장 **≤3탭**.
- **산출:** `src/hooks/useSavePlace.ts`, `src/lib/region/parseKakaoAddress.ts`, `src/components/places/SaveSheet.tsx`, `src/pages/places/PlacesPage.tsx`(위시 목록).
- **의존성:** P1a, P0c, P0e.
- **DoD:** **저장 ≤3탭** / 중복 시 기존 카드 점프+wish만 추가 / region 자동 채움 정확.
- **테스트:** 저장 탭 수(e2e 카운트), 중복 점프, 주소 파싱 단위.

## P1c — 지도 별표 마커 + 클러스터링 + 출처 아바타

- **범위:** 카카오맵 JS SDK 표시. 마커 **별표**(가고싶음=빈 별 / 가봤음=채운 별+체크 — 색만 아니라 **모양/패턴 이중화**, §8 접근성). 줌아웃 클러스터링(SDK 내장 우선). 마커 탭→미니카드(이름·사진1·상태)→상세. 상단 필터 가고싶은/가본/전체(§4.2 Wish/Visit 도출). 출처 **아바타 점**.
- **산출:** `src/lib/kakao/map.ts`(SDK 로더), `src/components/map/StarMarker.tsx`, `src/components/map/MiniCard.tsx`, `src/components/map/MapFilters.tsx`, `src/pages/map/MapPage.tsx`.
- **의존성:** P1b.
- **DoD:** 마커 상태가 색+모양으로 구분 / 클러스터링 동작 / 필터 토글 정확 / 출처 아바타 표시.
- **테스트:** 마커 상태 렌더 스냅샷, 필터 도출 로직 단위, 클러스터 비주얼 스모크.

## P1d — 공유(Realtime) + 충돌/오프라인 기본 (횡단 시작)

- **범위:** Supabase Realtime로 places/wishes 자동 전파(TanStack Query 캐시 동기화). **낙관적 락**(version 조건부 update, LWW 금지, 서버 버전 높으면 충돌 표시, §4.3). **오프라인 큐잉**(쓰기 로컬 큐→재연결 동기화, 충돌 표시). soft-delete=휴지통(deleted_at만, 복구 유예).
- **산출:** `src/lib/sync/realtime.ts`, `src/lib/sync/offlineQueue.ts`, `src/lib/sync/optimisticLock.ts`, `src/state/queryClient.ts`, `src/components/common/ConflictBanner.tsx`, `src/components/common/Trash.tsx`.
- **의존성:** P1b, P0e.
- **DoD:** **약전파 데이터 유실 0** / 동시편집 시 version 충돌 감지·표시(무음 덮어쓰기 없음) / 오프라인 쓰기 재연결 시 반영 / soft-delete 복구 가능.
- **테스트(횡단 P1부터 필수):** Realtime 전파, version 충돌 시나리오, 오프라인 큐→재연결 머지, soft-delete/복구.

---

# P2 — 일정 (3트랙 공유 캘린더) + 푸시 인프라 당김

설계서 §5.1, §4.2. DoD(단계 2): **종일·반복 정상, 두 단말 색 도출 일치**. 설계서 §9.1 주석대로 **푸시 인프라를 알림 필요 시점(P2)으로 당김**.

## P2a — 캘린더 뷰 셸 (월/주/일/아젠다)

- **범위:** 4개 뷰 + 오버레이, 상단 칩으로 트랙 토글(나/상대/함께). 길게 눌러 생성·드래그 이동(구글 캘린더/TimeTree 레퍼런스). 빈 상태.
- **산출:** `src/pages/calendar/CalendarPage.tsx`, `src/components/calendar/{MonthView,WeekView,DayView,AgendaView}.tsx`, `src/components/calendar/TrackChips.tsx`.
- **의존성:** P0e, P1d.
- **DoD:** 4뷰 전환 / 트랙 칩 토글 / 길게눌러 생성 진입.
- **테스트:** 뷰 전환 스냅샷, 칩 토글 필터.

## P2b — 이벤트 모델 운영 (종일/타임존/장소연결/가시성/색 도출)

- **범위:** 이벤트 CRUD: 제목·start·end·is_all_day·time_zone(IANA)·visibility(PERSONAL/SHARED)·participants(OWNER_ONLY/BOTH)·owner_id·place_id?·memo. **색 런타임 도출**(SHARED=퍼플, PERSONAL 소유자색: 내=블루/상대=핑크 — 색+라벨 이중화). 장소 연결→지도/장소 탭 연계.
- **산출:** `src/hooks/useEvents.ts`, `src/lib/calendar/deriveTrackColor.ts`, `src/components/calendar/EventSheet.tsx`, `src/lib/calendar/timezone.ts`.
- **의존성:** P2a.
- **DoD:** **두 단말 색 도출 일치** / 종일 배너 렌더 / 타임존 어긋남 0 / place 연결 양방향.
- **테스트:** 색 도출 매트릭스(소유자×visibility×보는사람), 타임존 변환, 종일 경계.

## P2c — 반복(RRULE) + 회차 예외 + 사용자별 리마인더

- **범위:** recurrence_rule(RRULE) 전개, 특정 회차 수정/삭제=EXDATE/RECURRENCE-ID(§4.2). 리마인더 **사용자별** `reminders=[{userId, offsetMinutes}]`(둘이 다른 시각).
- **산출:** `src/lib/calendar/rrule.ts`, `src/lib/calendar/expandRecurrence.ts`, `src/components/calendar/ReminderEditor.tsx`.
- **의존성:** P2b.
- **DoD:** **반복 정상** / 단일 회차 예외(수정/삭제) / 사용자별 리마인더 독립 저장.
- **테스트:** RRULE 전개, EXDATE/RECURRENCE-ID 예외, 사용자별 리마인더 분리.

## P2d — 푸시 인프라 + 인앱 활동 피드 (당김)

- **범위:** §9.1 주석대로 알림 필요 시점에 구축. **iOS 웹푸시 제약**(PWA 홈화면+iOS16.4+만) → **인앱 활동 피드를 1차 알림 수단**으로(§8). 시간 기반(리마인더·D-day)·변경 알림("상대가 추가함") 스케줄러(pg_cron + Edge Function). 알림 권한은 **맥락에서 요청**(첫 리마인더 설정 시), 거부 시 인앱 피드 폴백.
- **산출:** `supabase/functions/notify-scheduler/index.ts`, `supabase/migrations/0008_pg_cron_reminders.sql`, `src/components/feed/ActivityFeed.tsx`, `src/lib/push/webpush.ts`(가능 시), `src/hooks/useNotificationPermission.ts`.
- **의존성:** P2c, P0f.
- **DoD:** 리마인더 시각에 인앱 피드 신호 / 웹푸시 가능 단말은 푸시 / 거부 시 피드 폴백 / 권한 맥락 요청.
- **테스트:** 스케줄러 트리거(시간 모킹), 피드 신호 생성, 권한 폴백.

---

# P3 — 기록 (가본 장소 + Trips + 공유 앨범)

설계서 §5.3, §5.4. DoD(단계 3): **자동분류 오배정 1탭 정정, 미분류 회수 가능**.

## P3a — 방문(Visit) + 가본 곳 전환

- **범위:** 장소 상세 "다녀왔어요"→날짜·trip 선택→`visits`(place_id·trip_id·visit_date·rating·memo) 생성(상태 플래그가 아니라 기록 추가, §5.3). 가본 곳으로 전환 **≤5탭**(§8 흐름별 목표). 마커가 채운별+체크로 도출 전환.
- **산출:** `src/hooks/useVisits.ts`, `src/components/places/MarkVisitedSheet.tsx`, `src/pages/places/VisitedListPage.tsx`.
- **의존성:** P1b.
- **DoD:** Visit 생성 시 마커 도출 전환 / 전환 ≤5탭 / 같은 장소 재방문 각각 기록.
- **테스트:** 전환 탭 수, 재방문 다중 기록, 도출 상태.

## P3b — Trips (여행별 / 지역별 보기)

- **범위:** `trips`(title·start_date·end_date·region_code·cover_photo_id) CRUD. **여행별** 타임라인 카드(커버·지역·기간·장소수), **지역별** region_code 그룹핑→시간순 방문. cover_photo 무결성(같은 couple, 삭제 시 null 폴백).
- **산출:** `src/hooks/useTrips.ts`, `src/pages/trips/{TripListPage,TripDetailPage,RegionViewPage}.tsx`, `src/components/trips/TripCard.tsx`.
- **의존성:** P3a, P0c.
- **DoD:** 여행별·지역별 보기 정확 / 커버사진 폴백 / region 그룹 안정.
- **테스트:** 그룹핑 로직, 커버 폴백, 빈 상태.

## P3c — 공유 사진 앨범 (EXIF 제안 + 수동 확정 + 미분류 트레이)

- **범위:** Supabase Storage 원본+썸네일 업로드, `photos`(storage_url·thumbnail_url·place_id?·trip_id?·taken_at·exif_lat?·exif_lng?·classified_by·uploaded_by·caption). EXIF로 trip/place **추정 제안**(자동 확정 금지, '자동' 배지), 1탭 수락/변경. GPS 없음→시각으로 trip만, 둘 다 못맞춤→**미분류(UNCLASSIFIED) 트레이**(정식 상태). 필터 칩(여행/지역/날짜/태그). **썸네일 지연 로딩**, 원본은 탭 시.
- **산출:** `src/lib/photos/exif.ts`, `src/lib/photos/upload.ts`(썸네일 생성), `src/components/photos/{PhotoGrid,UnclassifiedTray,ClassifySheet,AutoBadge}.tsx`, `src/pages/photos/AlbumPage.tsx`.
- **의존성:** P3b, P0e.
- **DoD:** **자동분류 오배정 1탭 정정 / 미분류 회수 가능** / 썸네일 지연로딩 / 자동배정 '자동' 배지.
- **테스트:** EXIF 파싱(GPS 유/무/시각만), 미분류 트레이 회수, 1탭 정정, 썸네일 지연로딩.

---

# P4 — 차별화 (지역별 추천 + AI 경로)

설계서 §5.6, §6. DoD(단계 4): **JSON 스키마 검증 100%, 환각 장소 0, 폴백 동작**.

## P4a — 지역별 추천 트리거 + 콜드스타트

- **범위:** 같은 지역 *가고싶은 장소* **임계치 3~5** 이상→추천 카드(좌표 지역·근접 클러스터링). **콜드스타트 보완**: 데이터 없으면 회고형("지난 속초 여행 다시 보기")·시드 추천으로 다층 빈 상태(§8).
- **산출:** `src/hooks/useRecommendations.ts`, `src/lib/recommend/cluster.ts`, `src/components/recommend/{RecoCard,EmptyRecoState}.tsx`, `src/pages/recommend/RecommendPage.tsx`.
- **의존성:** P1b, P3b.
- **DoD:** 임계치 충족 시 카드 / 콜드스타트 빈 인상 회피.
- **테스트:** 임계치 경계, 클러스터링, 빈 상태 층.

## P4b — AI 경로 생성 프록시 (구조화 출력·화이트리스트·면책·폴백)

- **범위:** Anthropic API(Claude) 프록시. **structured outputs(strict json_schema)** 또는 tool use strict로 JSON 강제, 프록시에서 zod/ajv 검증 후 실패 시 1회 재시도, `stop_reason != end_turn` 가드. **장소 화이트리스트**: 각 stop이 입력 place_id 집합 밖이면 거부(환각 차단). **영업시간 환각 금지**(AI에 추정 금지, "영업시간 미반영" 면책). **폴백**: 타임아웃/5xx/콜드스타트 시 좌표 TSP 순서 + 카테고리 끼니 슬롯 결정론 폴백. 결과 캐싱(P0f). 입력: 장소 배열+제약 JSON. 출력: `days[]→stops[]{place_id, 도착시각, 체류분, 이동메모, 추천이유}`.
- **산출:** `supabase/functions/ai-route/index.ts`, `src/lib/anthropic/routeSchema.ts`(zod), `src/lib/anthropic/types.ts`, `supabase/functions/_shared/fallbackTsp.ts`.
- **의존성:** P0f, P4a.
- **DoD:** **JSON 스키마 검증 100% / 환각 장소 0 / 폴백 동작** / 영업시간 면책 표시 / 월 상한·캐시 적용.
- **테스트:** 스키마 검증(유효/무효), 화이트리스트 거부, stop_reason 가드, 폴백 경로(타임아웃 모킹), 캐시 히트.

## P4c — 결정론 후처리 + 길찾기 이동시간

- **범위:** 길찾기 프록시(카카오모빌리티/TMap) — **순서 고정 후 인접 N−1구간만 단방향** 호출(O(N²)·순환 회피), 대표 소요시간 캐시. **결정론 후처리**: 도착시각 = 직전 도착 + 체류분 + 구간 이동시간을 **앱이 재계산**(AI 산술 불신).
- **산출:** `supabase/functions/directions/index.ts`, `src/lib/route/recompute.ts`, `src/lib/route/legCache.ts`.
- **의존성:** P4b.
- **DoD:** 도착시각 앱 재계산 일치 / 구간 호출 N−1회 / 캐시 적용.
- **테스트:** 재계산 정확도, 구간 호출 수, 캐시.

## P4d — 코스 편집 초안 + 부분 재생성 + 루프 닫기

- **범위:** 생성 코스=**편집 가능 초안**(stop 핀 고정/제외→부분 재생성). 루프 닫기: ① 지도 **폴리라인** 동선, ② **"함께 캘린더에 추가"**로 이벤트 자동 생성(`itinerary_id` 출처 보존). `itineraries`(trip_id·days jsonb·created_by) 저장.
- **산출:** `src/components/recommend/{RouteEditor,StopPin}.tsx`, `src/lib/route/partialRegen.ts`, `src/components/map/RoutePolyline.tsx`, `src/hooks/useItineraryToEvents.ts`.
- **의존성:** P4b, P4c, P2b.
- **DoD:** 핀 고정·부분 재생성 동작 / 폴리라인 렌더 / 캘린더 이벤트 자동 생성 시 itinerary_id 보존.
- **테스트:** 부분 재생성(핀 보존), 폴리라인, 이벤트 생성 출처.

---

# P5 — 마감 (블로그 발행 + 폴리시)

설계서 §7, §8, §10. DoD(단계 5): **발행 사진 EXIF 제거 검증**.

## P5a — blog auto writer 연동 (가공본·비공개 기본·고정 스키마)

- **범위:** 발행 시 원본 **복사→EXIF/GPS 스트립→리사이즈→공개 경로 재업로드**, 페이로드엔 **가공본 URL만**(§7, §10). **비공개 기본**, 공개 동의 다이얼로그. 고정 페이로드 스키마(place·region·dates·coordinates·memo·mapUrl·photos[]). 운반책 택1(MVP 권장: iOS 공유시트/단축어; 또는 REST/Webhook `POST /import`; GitHub 토큰은 프록시 경유·_drafts/PR).
- **산출:** `supabase/functions/blog-publish/index.ts`(EXIF 스트립·리사이즈·재업로드), `src/lib/blog/payloadSchema.ts`, `src/components/blog/{PublishDialog,ConsentDialog}.tsx`.
- **의존성:** P3c.
- **DoD:** **발행 사진 EXIF 제거 검증**(GPS/촬영시각 없음) / 비공개 기본 / 페이로드 스키마 고정 / 공개 동의.
- **테스트:** EXIF 스트립 검증, 페이로드 스키마, 동의 게이트, 가공본 URL만 포함.

## P5b — UX 폴리시 · 애니메이션 · 접근성 패스

- **범위:** 모션/햅틱/전환(하트 애니메이션·마커 드롭·탭 전환), **Reduce Motion 분기**. 접근성 패스: **색+패턴/라벨 이중화**, VoiceOver 라벨, Dynamic Type, 다크모드. 다층 빈 상태·로딩 디테일 최종 점검. 온보딩 최소화(초대/연결·색 2개·위치/사진 상호 동의 §10.3).
- **산출:** `src/styles/motion.css`, `src/lib/a11y/`, `src/components/common/{EmptyState,Skeleton}.tsx`, `src/pages/OnboardingPage.tsx`.
- **의존성:** P0~P4.
- **DoD:** Reduce Motion 시 모션 제거 / VoiceOver 라벨 전수 / 색각 이중화 / 다층 빈 상태.
- **테스트:** Reduce Motion 분기, a11y 스냅샷(axe), 빈 상태 스냅샷.

---

# 횡단 트랙 (모든 단계, 설계서 §9.2)

| 트랙 | 시작 | 내용 | DoD/근거 |
|---|---|---|---|
| **테스트(동기화/충돌/오프라인)** | **P1d부터 필수** | Realtime 전파·version 낙관적락 충돌·오프라인 큐·soft-delete/복구. 매 패킷 vitest+e2e | §9.2, §4.3 / 약전파 유실 0 |
| **백업/내보내기** | P0g(v0) → 점진 강화 | JSON 덤프 → **관계종료 ZIP(사진)+JSON, 양측 동등**(§10.4). DISCONNECT 흐름, 사본 정책, 삭제 요청 | §10.4 / 양측 내보내기 권리 동등 |
| **CI/배포** | P0a | 4게이트(tsc/vitest/build/Playwright) CI, PWA 배포 파이프라인 | §9.2 / CI 그린 |
| **비용 추적(TCO)** | P0f부터 | 월 사용량/비용 상한 카운터, Supabase keep-alive(무료 유지) 또는 Pro, Storage 썸네일/원본 분리, Claude 캐싱·상한 | §9.2 TCO 표 / 폭주 차단 |
| **보안/프라이버시** | 단계별 체크 | 키 전부 프록시(§10.1), RLS 전 테이블(§10.2), 1회용 만료 초대·1:1 바인딩·복구(§10.3), PIPA/위치정보보호법 동의·최소수집·발행 동의(§10.3~10.4) | §10 / 단계별 체크리스트 통과 |

## 관계 종료 내보내기 (§10.4 — 백업 트랙 마일스톤)

- **범위:** DISCONNECT 흐름(couples.status→DISCONNECTED), **각자 내보내기(사진 ZIP + JSON) 권리 양측 동등**, 연결 해제 시 공유 데이터 사본 정책 명시(누가 보관/삭제), 삭제 요청 처리.
- **산출:** `supabase/functions/export-zip/index.ts`(사진+JSON), `src/pages/us/DisconnectPage.tsx`, P0g 확장.
- **의존성:** P0g, P3c.
- **DoD:** 양측이 동등하게 ZIP+JSON 내보내기 / DISCONNECT 후 사본 정책대로 처리 / 삭제 요청 반영.
- **테스트:** 양측 내보내기 동등성, 사진 포함 ZIP, DISCONNECT 상태 전이.
