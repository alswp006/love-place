# R6 — GPS 여행 동선 기록 (Journey/Route Recording) 구현 설계서

> 상태: **설계 초안 (구현 전 검토용)**. 소스 오브 트루스: `여행관리앱_설계서.md` + `CLAUDE.md` + `.claude/rules/*`. 본 문서는 리서치 4종(A 라이브러리 / B 위치정보법 / C 동의 UX / D 코드베이스)을 사실 근거로 한다.
> **법적 경고**: 본 기능은 개인위치정보를 수집·제3자(연결된 상대)에게 제공하는 **위치기반서비스(LBS)** 다. 공개 배포 전 `위치기반서비스사업 신고`(방통위, emsit.go.kr)가 **선행 게이트**다. 신고 전 코드는 작성 가능하나 **출시는 신고에 게이트된다**(§9).

---

## 1. Goal / Non-goals

**Goal (1문장)**
사용자가 명시적으로 누른 **"여행 시작" ~ "여행 종료"** 사이에만 GPS 동선을 샘플링해 `route_points`에 적재하고, 기존 recap 폴리라인(visits 기반)에 **실측 경로**로 연결해 둘이 함께 다시 보는 회고 자산을 만든다.

**Non-goals (YAGNI)**
- ❌ **상시 백그라운드 추적 금지.** 세션(시작~종료) 밖에서는 위치를 단 한 점도 수집하지 않는다. iOS `Always` 권한·Android `ACCESS_BACKGROUND_LOCATION`·Play 백그라운드 위치 선언은 **회피**한다(§6).
- ❌ **실시간 라이브 위치 공유(상대가 내 현위치를 분 단위로 본다)는 R6 범위 밖.** R6는 기본적으로 **리캡(사후 동선)** 스코프다. 실시간 스코프는 데이터모델·동의에서 *예약*만 하고 토글은 기본 OFF·기능 비활성(§4, §10 결정사항).
- ❌ **무거운 소셜 금지** — 댓글 스레드·팔로우·공개 피드 없음. 둘만, 비공개 기본.
- ❌ **자동 시작 금지** — 지오펜스/모션 자동 트리거로 세션을 켜지 않는다(자동 시작 = 사실상 상시추적, 법·심사 리스크). 항상 사용자 탭으로만 시작.
- ❌ 새 외부 키 클라이언트 노출 금지. 도로 스냅은 기존 `directions` Edge Function 프록시 재사용.

---

## 2. Architecture

### 2.1 데이터 흐름 (텍스트 다이어그램)

```
[온보딩/우리탭] 4종 동의 기록(consent_log) ──┐
                                            │ (수집 동의 timestamp 필수 게이트)
                                            ▼
[여행 시작 탭] ──prominent-disclosure 시트──> OS 위치권한(When-In-Use) 요청
   │  (최초 1회만; 이후 권한 있으면 스킵)
   ▼
bg-geo 플러그인 start()  ── trip_session(id) 생성, status=RECORDING
   │  iOS: allowsBackgroundLocationUpdates=true, WhenInUse, 파란 상태바
   │  Android: foreground service(type=location) + 상시 알림 "동선 기록 중"
   ▼
onLocation(lat,lng,ts,accuracy,speed)  ── distanceFilter ~10~50m, Moving/Stationary
   │  └─> ① 로컬 IndexedDB 큐(오프라인/약전파 무손실)
   │  └─> ② 네이티브 HTTP 경로(CapacitorHttp) ─> Supabase insert route_points
   │        (WebView fetch 금지 — Android 5분 후 throttle)
   │  └─> 매 수집 시 location_access_log(COLLECT) append
   ▼
[지도] 라이브 폴리라인(현 세션 route_points, realtime 구독) + "기록 중" 배지
   │
[여행 종료 탭] ── bg-geo stop(), trip_session.status=DONE, ended_at=now()
   │  └─> 최종 flush(큐 잔량 동기화) + 세션 요약(거리/시간/점수)
   ▼
[RecapPage] useTripRecap ──┬─ (기존) visits→orderedVertices→geodesic/snapped
                           └─ (신규) useRecordedRoute(tripId) ─> route_points 시계열
                                └─> simplify(Douglas-Peucker) ─> NaverMap polyline
   │  recapStats: recordedDistanceKm(실측) vs geodesicDistanceKm(방문간 직선)
   ▼
[제3자 제공 시점] 상대가 내 recap 동선을 "조회/열람"하는 순간
   └─> location_access_log(PROVIDE, recipient=partner) append
        + 통보 디스패처(인앱 활동 피드: 즉시 OR 30일 배치 — 사용자 선택)

[동의 철회 / 일시중지 / 목적달성]
   └─> 즉시 stop() + route_points 하드 파기(crypto-shred/secure-delete)
        + 해당 스코프 location_access_log 동반 파기(제24조4)
        + 확인자료(audit)는 보존기간까지 유지 후 자동 파기잡(pg_cron)
```

### 2.2 기존 recap 아키텍처와의 결합

현재(D): `Trip → Visits(trip_id) → Places(좌표) → orderedVertices(visit_date순) → 폴리라인(geodesic 또는 directions 스냅)`. R6는 **새 vertex 소스**를 하나 추가하는 것이지 기존을 대체하지 않는다.

| 결합 지점 | 현재 | R6 확장 |
|---|---|---|
| `useTripRecap.ts` | `orderedVertices(visits, placesById)` | `useRecordedRoute(coupleId, tripId)` 병행 — route_points 시계열 반환 |
| `RecapPage.tsx:34-36` | `useSnappedPolyline(...) ?? geodesic` | recorded 폴리라인 우선, 없으면 기존 fallback 체인 유지 |
| `recapStats.ts` | `haversineKm(vertices)` | `recordedDistanceKm` 추가(연속 점 누적), `stops`는 여전히 visits |
| `NaverMap.tsx:84-103` | `polyline: LatLng[]` (strokeColor `#e2638a`) | 입력 형태 동일 — recorded 점 배열을 그대로 주입 (변경 없음) |
| `useSnappedPolyline.ts` | `directions` 프록시로 visit 쌍 스냅 | recorded 동선은 **이미 실측 경로**이므로 스냅 불필요(서버 비용 절감); 다운샘플만 |

**설계 원칙 보존**: recorded 동선은 "실측"이므로 도로 스냅을 강제하지 않는다(원점은 실제 이동). 점 수가 많으면 클라이언트에서 Douglas–Peucker 단순화 후 렌더(과대샘플 방지, 배터리/렌더 비용↓).

---

## 3. Data Model

D가 명시한 repo 관례를 **정확히** 따른다: `couple_id` FK NOT NULL · `created_at/updated_at/created_by/updated_by` · `deleted_at`(soft-delete) · `version`(앱 증가 낙관적 락) · 부분 인덱스 `WHERE deleted_at IS NULL` · RLS `couple_id = current_couple_id() AND deleted_at IS NULL` · realtime publication. **단, 제23·24조 하드 파기 경로는 soft-delete의 의도적 예외**(아래 3.4).

### 3.1 `trip_sessions` — 기록 세션(시작~종료)
세션 메타. 동선 점들의 부모. `trips`와 1:N(선택적 연결: 세션을 나중에 trip에 붙임).

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `couple_id` | uuid FK couples NOT NULL | RLS 기준 |
| `trip_id` | uuid FK trips NULL | 세션→여행 연결(나중에 붙일 수 있음, ON DELETE SET NULL) |
| `owner_id` | uuid FK profiles NOT NULL | **이 동선을 기록한 사람**(=개인위치정보주체). 색/출처/철회 권리 주체 |
| `status` | text CHECK in (`RECORDING`,`PAUSED`,`DONE`,`DISCARDED`) | |
| `started_at` | timestamptz NOT NULL | |
| `ended_at` | timestamptz NULL | |
| `point_count` | int DEFAULT 0 | 캐시(렌더 전 빈상태 판단) |
| `recorded_distance_m` | int NULL | 종료 시 계산 캐시 |
| `purge_after` | timestamptz NULL | 파기 예약(철회/목적달성 시 세팅, §3.4) |
| `created_at/updated_at` | timestamptz DEFAULT now() | 트리거 touch |
| `created_by/updated_by` | uuid FK profiles NOT NULL | 감사 |
| `deleted_at` | timestamptz NULL | soft-delete(휴지통) |
| `version` | int DEFAULT 1 | 낙관적 락(앱 증가) |

### 3.2 `route_points` — 좌표 포인트(개인위치정보 본체)
연속 GPS 샘플. **암호화 대상**(제16조1, §3.3). 대량·append 위주.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `couple_id` | uuid FK NOT NULL | RLS |
| `session_id` | uuid FK trip_sessions NOT NULL | ON DELETE CASCADE(부모 세션 하드파기 시 동반) |
| `owner_id` | uuid FK profiles NOT NULL | 주체 |
| `lat` / `lng` | **암호화 저장**(아래 주: bytea 또는 컬럼암호) | 평문 double 금지(제16조1 at-rest 암호화) |
| `accuracy_m` | real NULL | 정확도(저정밀 점 필터링용) |
| `speed_mps` | real NULL | |
| `recorded_at` | timestamptz NOT NULL | 기기 측정 시각(정렬·거리계산 기준) |
| `client_point_id` | text NOT NULL | 오프라인 큐 멱등키(중복 insert 방지, UNIQUE(session_id, client_point_id)) |
| `created_at/created_by` | | 감사(point는 사실상 immutable → updated_*/version은 두되 미사용 가능) |
| `updated_at/updated_by` | | 관례 일관 위해 둠 |
| `deleted_at` | timestamptz NULL | soft-delete(휴지통). **단 법적 파기는 하드 DELETE, §3.4** |
| `version` | int DEFAULT 1 | |

> **암호화 결정(소유자 검토 필요, §10)**: 제16조1은 "저장 위치정보 암호화"를 요구. 옵션 (a) Supabase Postgres `pgcrypto` 컬럼 암호화(`pgp_sym_encrypt`, 키는 Edge Function 시크릿) — RLS와 별개로 raw 좌표를 service 레이어에서만 복호. (b) 애플리케이션 레벨 봉투암호화 후 bytea 저장. (c) 최소안: DB 디스크 암호화(Supabase 기본 at-rest) + 전송 TLS로 "암호화 소프트웨어 활용" 충족 주장. **권고: (a)** — `lat/lng`를 `bytea`로 두고 좌표가 필요한 읽기는 전용 RPC/Edge Function 경유. (단 라이브 폴리라인 렌더 지연 트레이드오프 → §10 결정).

### 3.3 `location_access_log` — 확인자료(제16조2) **append-only, 사용자 삭제 불가**
"누가/언제/무엇을/누구에게" 처리했는지의 **사실 기록**. 좌표 본체와 **분리**. soft-delete/version 관례를 따르되 **앱은 절대 행을 지우지 않는다**(파기는 보존기간 만료 자동잡만, §3.4).

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `couple_id` | uuid FK NOT NULL | RLS |
| `data_subject_id` | uuid FK profiles NOT NULL | 개인위치정보주체(동선 주인) |
| `actor_id` | uuid FK profiles NULL | 요청·취급자(시스템 수집 시 = subject) |
| `event_type` | text CHECK in (`COLLECT`,`USE`,`PROVIDE`) | |
| `event_at` | timestamptz NOT NULL DEFAULT now() | 수집/이용/제공 일시 |
| `purpose` | text NOT NULL | 목적("여행 동선 기록", "상대 열람") |
| `recipient_id` | uuid FK profiles NULL | PROVIDE 시 = 상대 B |
| `session_ref` | uuid NULL | 관련 세션(파기 후에도 메타만; FK 미설정 — 본체 하드파기와 독립 생존) |
| `retain_until` | timestamptz NOT NULL | event_at + 보존기간(기본 6개월, §4) |
| `created_at/created_by` | | |
| `deleted_at`/`version` | | 관례; deleted_at은 자동파기잡만 사용 |

> **확인자료 항목 근거(B)**: 제19조3 공개항목(제공받는 자/제공일시/제공목적) + 제16조2. 정확한 시행령 항목은 출시 전 재확인(§10 리스크).

### 3.4 `consent_log` — 4종 동의 감사(C)
기존 `profiles.location_consent_at`(0014)은 "수집 동의 시각"의 캐시로 유지하되, **법적 감사용 정본은 별도 append-only `consent_log`**. 동의는 4종 분리·기본 OFF(다크패턴 금지).

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK profiles NOT NULL | 동의 주체(본인만 기록) |
| `couple_id` | uuid FK NULL | |
| `consent_type` | text CHECK in (`COLLECT_USE`,`THIRD_PARTY_PROVIDE_PARTNER`,`NOTIFY_METHOD`,`RESERVE_NOTICE_ACK`) | 4종 |
| `scope` | text CHECK in (`RECAP`,`REALTIME`) NULL | 리캡/실시간 분리 토글 |
| `granted` | boolean NOT NULL | 부여/철회 |
| `notify_mode` | text CHECK in (`IMMEDIATE`,`BATCHED_30D`) NULL | NOTIFY_METHOD 선택값 |
| `policy_version` | text NOT NULL | 보여준 약관 semver |
| `shown_text_hash` | text NOT NULL | 표시 문구 해시(증빙) |
| `granted_at` / `withdrawn_at` | timestamptz | |
| `created_at/created_by` | | append-only(수정·삭제 안 함) |

### 3.5 SQL 마이그레이션 스케치 (`0016_route_recording.sql`)

```sql
-- 0016 R6 GPS 동선 기록 — route_sessions/points + 확인자료 + 동의 감사
-- 관례: couple_id + soft-delete + version + 감사필드 + RLS(current_couple_id) + realtime
-- 예외: 좌표(route_points) & 확인자료는 제23·24조에 따른 '하드 파기' 경로를 별도로 가진다(soft-delete의 의도적 예외).

-- 0) pgcrypto (좌표 컬럼 암호화용; 키는 Edge Function 시크릿으로만 전달)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) trip_sessions ----------------------------------------------------------
CREATE TABLE public.trip_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id     uuid NOT NULL REFERENCES public.couples(id),
  trip_id       uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  owner_id      uuid NOT NULL REFERENCES public.profiles(id),
  status        text NOT NULL DEFAULT 'RECORDING'
                  CHECK (status IN ('RECORDING','PAUSED','DONE','DISCARDED')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  point_count   int NOT NULL DEFAULT 0,
  recorded_distance_m int,
  purge_after   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL REFERENCES public.profiles(id),
  updated_by    uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at    timestamptz,
  version       int NOT NULL DEFAULT 1
);
CREATE INDEX idx_trip_sessions_couple ON public.trip_sessions(couple_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_trip_sessions_trip   ON public.trip_sessions(trip_id)   WHERE deleted_at IS NULL;
CREATE INDEX idx_trip_sessions_purge  ON public.trip_sessions(purge_after) WHERE purge_after IS NOT NULL;

-- 2) route_points (좌표 암호화) ---------------------------------------------
CREATE TABLE public.route_points (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id     uuid NOT NULL REFERENCES public.couples(id),
  session_id    uuid NOT NULL REFERENCES public.trip_sessions(id) ON DELETE CASCADE,
  owner_id      uuid NOT NULL REFERENCES public.profiles(id),
  lat_enc       bytea NOT NULL,   -- pgp_sym_encrypt(lat::text, key)
  lng_enc       bytea NOT NULL,
  accuracy_m    real,
  speed_mps     real,
  recorded_at   timestamptz NOT NULL,
  client_point_id text NOT NULL,  -- 오프라인 큐 멱등키
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL REFERENCES public.profiles(id),
  updated_by    uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at    timestamptz,
  version       int NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX uq_route_points_idem ON public.route_points(session_id, client_point_id);
CREATE INDEX idx_route_points_session ON public.route_points(session_id, recorded_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_route_points_couple  ON public.route_points(couple_id) WHERE deleted_at IS NULL;

-- 3) location_access_log (확인자료 — append-only) ---------------------------
CREATE TABLE public.location_access_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id       uuid NOT NULL REFERENCES public.couples(id),
  data_subject_id uuid NOT NULL REFERENCES public.profiles(id),
  actor_id        uuid REFERENCES public.profiles(id),
  event_type      text NOT NULL CHECK (event_type IN ('COLLECT','USE','PROVIDE')),
  event_at        timestamptz NOT NULL DEFAULT now(),
  purpose         text NOT NULL,
  recipient_id    uuid REFERENCES public.profiles(id),
  session_ref     uuid,            -- FK 미설정: 본체 파기 후에도 메타 생존
  retain_until    timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at      timestamptz,
  version         int NOT NULL DEFAULT 1
);
CREATE INDEX idx_lal_couple   ON public.location_access_log(couple_id);
CREATE INDEX idx_lal_subject  ON public.location_access_log(data_subject_id, event_at);
CREATE INDEX idx_lal_retain   ON public.location_access_log(retain_until);

-- 4) consent_log (4종 동의 감사 — append-only) -----------------------------
CREATE TABLE public.consent_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id),
  couple_id     uuid REFERENCES public.couples(id),
  consent_type  text NOT NULL CHECK (consent_type IN
                  ('COLLECT_USE','THIRD_PARTY_PROVIDE_PARTNER','NOTIFY_METHOD','RESERVE_NOTICE_ACK')),
  scope         text CHECK (scope IN ('RECAP','REALTIME')),
  granted       boolean NOT NULL,
  notify_mode   text CHECK (notify_mode IN ('IMMEDIATE','BATCHED_30D')),
  policy_version text NOT NULL,
  shown_text_hash text NOT NULL,
  granted_at    timestamptz,
  withdrawn_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL REFERENCES public.profiles(id)
);
CREATE INDEX idx_consent_user ON public.consent_log(user_id, consent_type);

-- 5) GRANT (authenticated) — 0004 패턴
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.trip_sessions, public.route_points,
  public.location_access_log, public.consent_log TO authenticated;

-- 6) RLS ENABLE + 정책 (0004 골격 그대로)
ALTER TABLE public.trip_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_points        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_log         ENABLE ROW LEVEL SECURITY;

CREATE POLICY trip_sessions_couple ON public.trip_sessions
  FOR ALL USING (couple_id = public.current_couple_id() AND deleted_at IS NULL)
          WITH CHECK (couple_id = public.current_couple_id());

CREATE POLICY route_points_couple ON public.route_points
  FOR ALL USING (couple_id = public.current_couple_id() AND deleted_at IS NULL)
          WITH CHECK (couple_id = public.current_couple_id());

-- 확인자료: 내 커플 행 SELECT/INSERT만. UPDATE/DELETE는 막는다(append-only) → 파기는 service_role 잡만.
CREATE POLICY lal_select ON public.location_access_log
  FOR SELECT USING (couple_id = public.current_couple_id());
CREATE POLICY lal_insert ON public.location_access_log
  FOR INSERT WITH CHECK (couple_id = public.current_couple_id());
-- (UPDATE/DELETE 정책 부재 → authenticated 불가. service_role만 파기)

-- 동의 로그: 본인 것만 (profiles_self 패턴)
CREATE POLICY consent_self_select ON public.consent_log
  FOR SELECT USING (user_id = auth.uid()
                    OR couple_id = public.current_couple_id());  -- 상대 "동의함" 가시(0014 철학)
CREATE POLICY consent_self_insert ON public.consent_log
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- 7) updated_at 트리거 (0003 touch_updated_at 재사용)
CREATE TRIGGER trg_touch_trip_sessions BEFORE UPDATE ON public.trip_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_touch_route_points  BEFORE UPDATE ON public.route_points
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 8) Realtime publication (0005 패턴) — 라이브 폴리라인/교차기기 동기화
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.route_points;
ALTER PUBLICATION supabase_realtime ADD TABLE public.location_access_log;

-- 9) 하드 파기 (제23·24조) — service_role 전용, soft-delete 우회
--    철회/목적달성 시 좌표+세션+해당 PROVIDE/COLLECT 확인자료를 '복구불가' 삭제.
CREATE OR REPLACE FUNCTION public.purge_location_data(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.route_points  WHERE session_id = p_session_id;  -- CASCADE 대비 명시
  DELETE FROM public.trip_sessions WHERE id = p_session_id;
  -- 확인자료: 철회 스코프에 한해 동반 파기(제24조4). 보존의무가 남는 행은 유지.
  DELETE FROM public.location_access_log
    WHERE session_ref = p_session_id AND retain_until < now();
END $$;
REVOKE ALL ON FUNCTION public.purge_location_data(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_location_data(uuid) TO service_role;

-- 10) 확인자료 보존기간 만료 자동 파기 (제40조의2 미파기 처벌 방지)
CREATE OR REPLACE FUNCTION public.purge_expired_access_log()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  DELETE FROM public.location_access_log WHERE retain_until < now();
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.purge_expired_access_log() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_access_log() TO service_role;
-- pg_cron: SELECT cron.schedule('purge-loc', '0 4 * * *',
--   $$ SELECT public.purge_expired_access_log(); $$);  -- 일 1회
```

> 좌표 복호 읽기는 RLS만으로 부족(암호 키 필요) → 라이브/리캡 폴리라인 조회는 **전용 RPC**(`get_session_points(session_id)` SECURITY DEFINER, 키는 시크릿) 또는 Edge Function 경유. 평문 `lat/lng` 컬럼을 노출하지 않는다.

---

## 4. Consent (4종 동의 + 일시중지/철회)

C 리서치에 따라 **4종 분리·기본 OFF·다크패턴 금지**(전자상거래법 제21조의2). 번들/사전체크 금지.

| # | 동의 종류 (`consent_type`) | 근거 | 고지 필수항목 | UI 위치 |
|---|---|---|---|---|
| (a) | **개인위치정보 수집·이용** `COLLECT_USE` | 제18조 | 목적("둘의 여행 동선 기록·지도 표시")·보관기간(철회 시까지/목적달성 즉시파기)·수집방법(기기 GPS/네트워크) | 온보딩③ |
| (b) | **제3자(연결된 상대) 제공** `THIRD_PARTY_PROVIDE_PARTNER` | 제19조1·2 | 제공받는 자(상대 표시명)·제공목적("상대에게 내 동선 공유")·통보사항 | 온보딩③ (별도 토글) |
| (c) | **제공사실 통보 방식** `NOTIFY_METHOD` | 제19조3·4 | 즉시(인앱 피드) vs 30일 배치 중 선택, 둘 다 고지 | 온보딩③ |
| (d) | **동의 유보 가능 고지** `RESERVE_NOTICE_ACK` | 제18조2·제19조5 | "위 동의 일부를 유보해도 핵심 기능 이용 가능" (체크박스 아닌 고지 라인 + ack) | 온보딩③ |

**타임라인 분리(C 권고)**:
- **온보딩(계정 레벨)**: (a)(b)(c) 수집 + (d) 고지. 단 (b) 유보해도 온보딩 완료 가능(핵심기능 차단 금지).
- **맥락(여행 시작 시)**: 실제 수집 시작 시점에 prominent-disclosure 시트 → OS 위치권한 요청(첫 실행 금지). 실시간 스코프가 켜질 때만 추가 재확인.

**일시중지/철회(제24조 — 거절불가·항상가능·기술적 수단 의무)**:
- `/us`(우리)에 **개인정보 컨트롤 센터**: ① "위치 공유 일시중지" 원탭 스위치(≤2탭 도달, 라이브 상태 배지 색+라벨+아이콘) ② "동의 관리/철회" 화면(4종 개별 철회, 전부/일부).
- 지도 화면에 **"기록 중" 상시 인디케이터** + 즉시 중지 버튼 노출(기록 중 락으로 중지 막으면 제24조2 위반).
- 철회 시 `purge_location_data()` 트리거 → 좌표·세션·스코프 확인자료 **지체없이 파기**(낙관적 락 version 조건부, LWW 금지).

**동의 기록 방식**: 모든 동의/철회는 `consent_log`에 `{type, scope, granted, notify_mode, policy_version, shown_text_hash, granted_at/withdrawn_at}` append. `policy_version` 변경 시 재동의 유도. 14세 미만 차단(가입 연령 게이트; 연애 맥락상 19+ 권장).

---

## 5. 법적 수용기준 (Acceptance Criteria) — 1:1 매핑

| # | 법적 요구 | 설계의 어느 부분이 / 어떻게 충족 | 검증 |
|---|---|---|---|
| **[1]** | 공개배포 = 위치기반서비스사업 신고 선행 (코드 외 전제) | **출시 게이트**(§9). 신고 완료 전 스토어 제출 금지를 릴리스 체크리스트에 못박음. 소상공인 특례(제9조의2)는 서비스 1개월 초과 시 신고 의무 — 2인=엔드유저 수일 뿐 면제 아님. emsit.go.kr 신고서·사업계획서·제16조 보호조치 증명 첨부. | 릴리스 체크리스트 항목(코드 게이트 아님). |
| **[2]** | 동의 없이 수집·이용·제공 = 형사처벌(제39조 5년/5천만원) → 수집 전 동의 + 목적·보관기간·제공대상 고지 | §4 (a)(b)(c) 4종 동의 + `consent_log` 정본. **수집 시작 게이트**: `trip_sessions` insert 전 클라이언트가 `COLLECT_USE.granted=true` 확인, 서버는 RLS+앱레이어로 동의 없는 세션 시작 거부. 고지 문구에 목적·보관기간·제공대상(상대) 명시 + `shown_text_hash` 증빙. | vitest: 동의 OFF 시 세션 시작 차단; e2e: 권한 시트 문구 노출. |
| **[3]** | "서로 공유" = 제3자 제공 → 별도 동의 + 언제든 철회/일시중지(거절불가·기술적 수단) | §4 (b) **별도 토글**(번들 금지). 제공 시점마다 `location_access_log(PROVIDE)` + 통보 디스패처. §4 컨트롤 센터의 일시중지(원탭, ≤2탭)·철회(전부/일부) — 기록 중에도 항상 동작(락 금지). | vitest: 4종 default-off·독립토글; e2e: 일시중지 도달≤2탭·즉시 제공중지; 철회→파기. |
| **[4]** | 확인자료 보존(6~12개월) + 철회 시 동선+확인자료 동반 파기 + 미파기 처벌 방지(자동 파기잡) | `location_access_log.retain_until = event_at + 6개월`(설정값). 철회 시 `purge_location_data()`로 좌표+세션+스코프 확인자료 하드파기(제24조4). 보존 만료분은 `purge_expired_access_log()` **pg_cron 일 1회** 자동파기(제40의2 방지). soft-delete 예외 = 복구불가 DELETE. | vitest: 철회→route_points 0행·스코프 확인자료 파기; 잡 단위테스트: retain_until 경과분만 삭제. |
| **[5]** | 제16조 안전성 확보(암호화/접근통제/접근기록/취급대장/자체점검) | `route_points.lat_enc/lng_enc` **pgcrypto 컬럼암호화**(at-rest) + TLS(in-transit). RLS+`current_couple_id()` 접근통제, 좌표 복호는 전용 RPC/Edge Function 최소권한. `proxy_call_log`/Supabase 로그 = 접속기록(~1년). 취급대장(~3년)·자체점검 = 운영 절차 문서(코드 외, §10). | RLS 격리 테스트; 암호화 컬럼이 평문 노출 안 됨 확인. |
| **[6]** | 개인정보보호법 + 위치정보법 동시 적용 | 위치정보법(본 설계 전반) + PIPA(최소수집·동의·열람/정정/삭제권·목적외 금지). 4종 동의·열람권(`location_access_log` 노출)·삭제권(철회 하드파기)·최소수집(distanceFilter·세션한정·상시추적 금지). 기존 `.claude/rules/security-privacy.md` PIPA 라인 계승. | 양법 체크리스트(§6 게이트). |

---

## 6. Capacitor Native

**채택 라이브러리(A 권고)**: `@transistorsoft/capacitor-background-geolocation` v9.2.0
- 사유: Capacitor 8 공식 지원(peerDep `^8.0.0`), on-demand `start()/stop()` 세션 녹화, distanceFilter + Moving/Stationary 모션감지(배터리), durable SQLite 큐(무손실).
- **비용 트레이드오프**: Android **release 빌드 유료 라이선스**(앱당 1회, v8키↛v9 — 재발급). DEBUG는 무료. **예산 거부 시 폴백**: `@capgo/background-geolocation` v8.1.1(MPL-2.0 무료, Cap8 호환) — 단 stationary 자동종료·durable 큐 없음(긴 하루 배터리↑, 오프라인 큐는 우리 IndexedDB로 보강). `@capacitor-community`(Cap7) 직접 사용 금지.

**iOS**
- 권한: **When-In-Use만** 요청(`locationAuthorizationRequest: 'WhenInUse'`). 포그라운드 "여행 시작" 탭에서 시작 → `allowsBackgroundLocationUpdates=true`로 백그라운드 지속(파란 상태바). **Always 미사용**(5.1.5 소명 난이도↓).
- Info.plist:
  - `NSLocationWhenInUseUsageDescription` = "여행을 시작하면 종료할 때까지 이동 경로를 기록해 나중에 함께 다시 볼 수 있어요."
  - `NSMotionUsageDescription` = "배터리 절약을 위해 이동/정지를 감지합니다." (transistorsoft 모션감지 사용 시)
  - `NSLocationAlwaysAndWhenInUseUsageDescription`은 **추가하지 않음**(Always 도입 시에만).
  - `UIBackgroundModes` = `location` (transistorsoft는 `fetch`/`processing`도 권장). Xcode > Background Modes > Location updates 체크. release용 `TSLocationManagerLicense`(JWT).
- **5.1.5 소명**: 동선 기록이 recap의 핵심 기능이며 명시적 사용자 탭으로만 시작, plist 문자열에 목적 명시 — 강한 reviewable 근거. (2.5.4 백그라운드 location 정당 목적).
- **제약 고지**: When-In-Use는 앱 강제종료/iOS kill 시 백그라운드 재개 안 됨 → 재진입 필요. 수동 세션엔 수용 가능, UI로 안내.

**Android**
- **Foreground service** `android:foregroundServiceType="location"` + 상시 알림("여행 동선 기록 중 — 종료하려면 앱에서 여행 종료"). 알림 숨김 불가 = 정직한 UX로 수용.
- 권한: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`(13+).
- **`ACCESS_BACKGROUND_LOCATION` 미선언 → Play 백그라운드 위치 선언/데모영상 회피.** foreground-service-only로 충족(앱 사용 중 시작·지속). 2026-04-15 강화 정책 사이드스텝. *앱 스와이프 후에도 지속이 꼭 필요해지면* 그때만 background location + 선언서 + ≤30초 데모영상(prominent-disclosure·런타임 프롬프트·기능 시연 포함, Android 기기 촬영) 추가 — **현재 범위는 미채택**(§10 결정).

**샘플링/배터리**
- `distanceFilter` ~10m(도보), driving은 elasticityMultiplier로 확대. `desiredAccuracy: HIGH`(Moving), Stationary 자동 종료로 배터리 보호.
- **업로드는 네이티브 HTTP(CapacitorHttp) 또는 플러그인 SQLite 큐** — WebView fetch 금지(Android 5분 후 throttle로 무음 실패). 우리 IndexedDB 오프라인 큐 + `client_point_id` 멱등키로 무손실.

---

## 7. UX Flows + 빈상태/로딩/에러 + 접근성

**플로우**
1. **여행 시작**: (지도/여행 탭 버튼) → [동의 게이트: `COLLECT_USE` OFF면 컨트롤 센터로 유도] → prominent-disclosure 시트("이 기능은 여행 중 위치를 수집해 동선을 기록합니다") → OS 권한(최초 1회) → 세션 생성 → "기록 중" 배지.
2. **기록 중**: 지도에 라이브 폴리라인(`#e2638a`) + 상시 "기록 중" 인디케이터 + 즉시 중지/일시중지 버튼.
3. **여행 종료**: 확인 다이얼로그 → stop() → 큐 최종 flush → 세션 요약(실측 거리/시간) → trip 연결 제안.
4. **리캡 보기**: RecapPage에서 실측 동선 우선 렌더(없으면 기존 geodesic/snapped fallback).
5. **상대 열람**: 상대가 내 recap 동선 조회 → `PROVIDE` 로그 + 통보(인앱 피드, 즉시/30일배치).

**필수 빈상태/로딩/에러(설계서 §8 규약)**
- **빈상태(다층)**: 세션 없음 → "첫 여행을 시작해 동선을 남겨보세요" CTA. 동의 없음 → "동선 기록을 켜려면 위치 공유에 동의해주세요" + 컨트롤 센터 링크. trip은 있으나 recorded 동선 없음 → 기존 visits 폴리라인으로 graceful fallback(죽은 화면 금지).
- **로딩**: 세션 점 로딩 = 폴리라인 스켈레톤(회색 박스 금지); 라이브는 점 누적 애니(Reduce Motion 시 즉시).
- **에러**: 권한 거부 → 폴백 안내(수동 핀/visits 기반 recap 가능, 기능 비강제). SDK 로드 실패/오프라인 → 재시도 UI. 동기화 충돌(version) → 명시 배지. 큐 적체 → "동기화 대기 N건" 표시.

**접근성(색+라벨 이중화, §8 규약)**
- "기록 중" 상태 = 색만 아님 → **빨강 점 아이콘 + "기록 중" 텍스트 + `aria-live`**. 일시중지 = 회색 + "일시중지됨" 라벨.
- 실측 동선 vs visits 직선 = 색만 아님 → 패턴(실선/점선) + 범례 라벨.
- 일시중지/철회 버튼 `aria-label`, ≤2탭 도달, `:focus-visible`. 다크모드 토큰. Dynamic Type(rem). prefers-reduced-motion: 점 드롭/펄스 생략.

---

## 8. Testing Strategy

**vitest (단위/통합)**
- 도출 로직: `recordedDistanceKm`(연속 점 누적) vs `geodesicDistanceKm`; Douglas–Peucker 단순화 정확도; `orderedRoute(points)` 시계열 정렬.
- **파기 로직**: 철회 → `route_points` 0행 + 세션 파기 + 스코프 확인자료 동반 파기; 보존중 확인자료는 생존. `purge_expired_access_log`가 `retain_until` 경과분만 삭제.
- **동의 게이트**: 4종 default-off·독립 토글(번들/사전체크 없음 회귀); `COLLECT_USE` OFF 시 세션 시작 차단; `policy_version` 변경 시 재동의.
- 통보: `PROVIDE` 이벤트마다 로그 1행 + 통보 큐 적재(즉시/배치).

**횡단(P1부터 — 동기화/충돌/오프라인)**
- 오프라인: 약전파에서 점 큐잉 → 재연결 flush, `client_point_id` 멱등으로 **유실 0·중복 0**.
- 충돌: 세션 version 조건부 update, 서버 version↑ 시 충돌 표시(LWW 금지).
- RLS 격리: couple A JWT로 B의 `route_points`/`trip_sessions`/`location_access_log` select=0건, insert 위조 거부, 미인증 거부.

**E2E (Playwright, 모바일 뷰포트)**
- 시작→기록중 배지→종료→리캡 폴리라인 렌더 스모크. 빈상태/로딩/에러·라이트/다크 스냅샷. 일시중지 도달 ≤2탭. (실제 GPS는 네이티브 — e2e는 모킹된 점으로 폴리라인 렌더만.)

**게이트**: `tsc` 0, vitest, build, e2e + RLS 격리 + 접근성 회귀. EXIF는 N/A(발행 무관).

---

## 9. Phasing — 신고 전 가능 vs 출시 게이트

**신고 전(개발/내부 DEBUG)에 만들 수 있는 것**
- `0016` 마이그레이션(테이블·RLS·realtime·파기함수) 전부.
- transistorsoft DEBUG 통합(무료), 샘플링·라이브 폴리라인·세션 시작/종료, recap 결합.
- 4종 동의 UI·`consent_log`, 일시중지/철회 컨트롤, 통보 디스패처, 파기잡, 전체 테스트 스위트.
- 암호화 컬럼·전용 RPC.
→ **내부 기기/테스트 트랙(TestFlight 내부, Play 내부테스트)까지는 진행 가능**(공개 배포 아님).

**출시가 신고에 게이트되는 것 (코드 외 전제)**
- **App Store / Play 공개 배포**: `위치기반서비스사업 신고`(방통위) 선행. 소상공인 특례 사용 시에도 1개월 초과 운영 = 신고 필수.
- 약관/위치기반서비스 이용약관에 제18·19·24조 항목 확정(보존기간·통보·철회).
- transistorsoft Android **release 라이선스 구매**(또는 capgo 폴백 확정).
- 제16조 운영 산출물: 취급대장·접속기록 보관·자체점검 절차 문서.
→ 이 게이트들이 끝나기 전엔 **스토어 제출 금지**(릴리스 체크리스트 차단 항목).

---

## 10. Open Risks & Decisions for Owner

**결정 필요(Decisions)**
1. **transistorsoft 유료 라이선스(Android release) 승인 vs capgo 무료 폴백** — 배터리/durable-queue 이점 vs 비용·TCO. (A)
2. **좌표 암호화 방식** — pgcrypto 컬럼암호(권고, 라이브 렌더 복호 지연) vs Supabase 기본 at-rest+TLS만(간단, 제16조1 해석 리스크). (B §3.2)
3. **실시간 라이브 위치 공유 포함 여부** — R6는 리캡 기본. 실시간 스코프는 데이터모델 예약만. 켜면 5.1.5/Play 난이도·통보 빈도↑. 기본 **미포함** 제안. (C)
4. **확인자료 보존기간 숫자** — 6개월(업계 표준, 제16조2 연동) vs 더 김(세법). 약관에 명시할 값 확정 필요. (B)
5. **운영 주체 신고 트랙** — 개인/소상공인 특례 적격 여부. 법률 자문 권장. (B)

**리스크(Risks)**
- **법 vs 하우스룰 충돌**: 제23·24조 "복구불가 즉시 파기" ↔ 프로젝트 글로벌 soft-delete(CLAUDE.md §5.3). 본 설계는 좌표/확인자료에 **하드 파기 예외**를 명시했으므로, 이후 리팩터링이 이를 soft-delete로 "되돌리지" 않도록 데이터모델 주석에 박았다. 미파기 = 제40의2(2년/2천만원).
- **단일 "위치 동의" 체크박스 = 가장 흔한 중대 위반**. 제18조 단독으로는 불충분, 제19조(제3자) 별도 필수.
- **확인자료 항목/보존기간 정확 수치**는 시행령 1차 텍스트 미확정(B 리서치 한계) — 출시 전 law.go.kr 통합본(2025-10-01) 재확인. 벌칙 제39~43조 번호 매핑도 개정으로 이동, 인용 전 대조.
- **Play 2026-04-15 정책 변동 중** — 제출 시점 선언요건 재확인. foreground-only 유지로 사이드스텝하되 enforcement 타임라인(Android 17+ ~2026-10말) 모니터.
- **iOS When-In-Use 종료 후 미재개** — 강제종료 시 mid-trip 점 유실 가능. 수동 세션엔 수용, UI 안내 필요. 손실 불가 시에만 Always 검토(스토어 난이도↑).
- **Android WebView HTTP throttle** — 반드시 네이티브 HTTP 경로. 누락 시 백그라운드 무음 실패.

---
관련 파일(절대경로):
- 신규 마이그레이션: `/Users/minje/Project/love_place/supabase/migrations/0016_route_recording.sql` (본 설계 §3.5)
- 결합 지점: `/Users/minje/Project/love_place/src/hooks/useTripRecap.ts`, `/Users/minje/Project/love_place/src/hooks/useSnappedPolyline.ts`, `/Users/minje/Project/love_place/src/pages/RecapPage.tsx` (24-36행), `/Users/minje/Project/love_place/src/components/map/NaverMap.tsx` (84-103행), `/Users/minje/Project/love_place/src/lib/recap/recapStats.ts`
- 관례 근거: `/Users/minje/Project/love_place/supabase/migrations/0004_rls_grants.sql`(RLS·`current_couple_id()`), `/Users/minje/Project/love_place/supabase/migrations/0005_realtime.sql`(publication), `/Users/minje/Project/love_place/supabase/migrations/0014_consent_purge.sql`(동의 컬럼·purge), `/Users/minje/Project/love_place/supabase/migrations/0003_triggers.sql`(`touch_updated_at`)
