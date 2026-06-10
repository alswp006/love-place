# love_place — 데이터 모델 (Supabase 구현 계약)

> 소스 오브 트루스: `여행관리앱_설계서.md` §4(데이터 모델)·§4.2(설계 선택)·§4.3(동기화/충돌/삭제)·§10.2(RLS). 스택은 B안(Supabase Postgres + Auth + RLS + Realtime + Storage)으로 확정. 이 문서는 설계서를 "구현 계약"으로 증류한 것이며, `supabase/migrations`의 출발점이다.

## 0. 규약 (전 테이블 공통)

- **명명:** Postgres = snake_case. 모든 식별자 `uuid` (`gen_random_uuid()` 기본). 시간 = `timestamptz`(UTC 저장, IANA 타임존은 이벤트별 컬럼). 날짜만 필요한 곳 = `date`.
- **공유 경계:** 공유 테이블 전부 `couple_id uuid NOT NULL REFERENCES couples(id)`. RLS의 단일 기준 키(§4.2·§10.2).
- **감사/동기화 필드 (변경 가능한 공유 테이블 전부, §4.3):**
  ```
  created_at  timestamptz NOT NULL DEFAULT now()
  updated_at  timestamptz NOT NULL DEFAULT now()
  created_by  uuid        NOT NULL REFERENCES profiles(id)
  updated_by  uuid        NOT NULL REFERENCES profiles(id)
  deleted_at  timestamptz                                  -- soft-delete, NULL=활성
  version     integer     NOT NULL DEFAULT 1               -- 낙관적 락
  ```
  - `regions`는 커플 무관 글로벌 마스터라 감사/동기화·`couple_id`를 갖지 않는다(예외, §4.2 region 이원화).
- **soft-delete:** 물리 DELETE 금지. `deleted_at`만 채운다. 조회는 `deleted_at IS NULL` 필터. 복구 유예 후 정리 작업은 별도 배치(§4.3 휴지통).
- **낙관적 락:** UPDATE는 `WHERE id = $1 AND version = $clientVersion`로 조건부, `SET version = version + 1, updated_at = now(), updated_by = $uid`. 영향 행 0 = 충돌 → 클라이언트에 충돌 신호(LWW 금지, §4.3). `updated_at` 자동 갱신 트리거는 별도로 두되 `version`은 앱이 명시 증가.
- **멤버십 정본:** `couples.user_a/user_b`가 정본, `profiles.couple_id`는 캐시. 어긋나면 couples 신뢰. 멤버 ≤2는 앱 레이어 강제(§4.2).

---

## 1. 테이블별 컬럼·타입·제약

### 1.1 `regions` (글로벌 마스터, 감사필드 없음)
지역 코드/표시명 이원화(§4.2). 법정동 b_code 접두.

| 컬럼 | 타입 | 제약 |
|---|---|---|
| code | text | PK (b_code 접두, 예: "51210" 강원 속초) |
| label | text | NOT NULL (표시명, 예: "속초") |
| parent_code | text | NULL, FK→regions(code) self-ref |

### 1.2 `couples`
커플 묶음·초대 상태(§4.2). 멤버십 정본.

| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid | PK |
| user_a | uuid | NOT NULL FK→profiles(id) (생성자) |
| user_b | uuid | NULL FK→profiles(id) (연결 전 null) |
| status | text | NOT NULL CHECK in ('PENDING','ACTIVE','DISCONNECTED') DEFAULT 'PENDING' |
| invite_code | text | NULL, UNIQUE (1회용·충분 엔트로피, §10.3) |
| invite_expires_at | timestamptz | NULL (만료) |
| connected_at | timestamptz | NULL |
| created_at/updated_at | timestamptz | (감사) |
| version | integer | (락) |

- CHECK: `user_b IS NULL OR user_b <> user_a` (자기 자신 연결 금지).
- 부분 UNIQUE: 활성 초대코드 유일성(아래 인덱스).

### 1.3 `profiles` (= USER; auth.users 확장)
`id`는 `auth.users.id`와 동일(1:1).

| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid | PK, FK→auth.users(id) ON DELETE CASCADE |
| couple_id | uuid | NULL FK→couples(id) (캐시, 정본은 couples) |
| display_name | text | NOT NULL |
| avatar_url | text | NULL |
| color | text | NOT NULL (트랙 색, 예: 내=블루 상대=핑크 §5.1) |
| created_at/updated_at/version | | (감사/락) |

- `created_by/updated_by/deleted_at`는 self-참조 모순을 피하려 profiles에선 생략(가입=auth, soft-delete는 auth 측 처리).

### 1.4 `places`
공유 장소(§5.2). 네이버 지역검색 결과 정규화(D5).

| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid | PK |
| couple_id | uuid | NOT NULL FK→couples(id) |
| name | text | NOT NULL |
| address | text | NULL |
| region_code | text | NULL FK→regions(code) |
| region_label | text | NULL (표시 캐시, 예: "속초") |
| lat | double precision | NULL |
| lng | double precision | NULL |
| category | text | NULL (네이버 카테고리) |
| kakao_place_id | text | NULL (UNIQUE per couple — 중복 점프 §5.2). 값=네이버 장소ID — 네이버는 고유 ID가 없어 `norm(name)\|norm(address)` 합성키 저장(normalize.ts), 컬럼명은 스키마 호환 위해 유지. 별도 `naver_place_id` 불필요 |
| tags | text[] | NOT NULL DEFAULT '{}' |
| memo | text | NULL |
| added_by | uuid | NOT NULL FK→profiles(id) |
| (감사/동기화 6필드) | | |

### 1.5 `wishes`
가고싶음 = per-user 의도(§4.2). 가고싶음/가봤음은 status가 아니라 도출.

| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid | PK |
| couple_id | uuid | NOT NULL FK→couples(id) |
| place_id | uuid | NOT NULL FK→places(id) |
| user_id | uuid | NOT NULL FK→profiles(id) (누가 찜) |
| priority | integer | NOT NULL DEFAULT 0 (하트 우선순위) |
| (감사/동기화 6필드) | | |

- UNIQUE (place_id, user_id) WHERE deleted_at IS NULL — 한 사람 한 장소 1위시.

### 1.6 `visits`
가봤음 = 파생 기록(§4.2·§5.3). 같은 장소 재방문 각각 행.

| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid | PK |
| couple_id | uuid | NOT NULL FK→couples(id) |
| place_id | uuid | NOT NULL FK→places(id) |
| trip_id | uuid | NULL FK→trips(id) |
| visit_date | date | NULL |
| rating | integer | NULL CHECK (rating BETWEEN 1 AND 5) |
| memo | text | NULL |
| (감사/동기화 6필드) | | |

### 1.7 `trips`
여행 묶음(§5.3).

| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid | PK |
| couple_id | uuid | NOT NULL FK→couples(id) |
| title | text | NOT NULL (예: "속초 2박3일") |
| start_date | date | NOT NULL |
| end_date | date | NOT NULL CHECK (end_date >= start_date) |
| region_code | text | NULL FK→regions(code) |
| cover_photo_id | uuid | NULL FK→photos(id) (삭제 시 null 폴백 §4.2) |
| (감사/동기화 6필드) | | |

- `cover_photo_id`는 photos FK이지만 무결성 규칙(같은 couple, 삭제 시 null)은 앱/트리거에서 강제. 순환 FK 회피 위해 마이그레이션에서 ALTER로 후행 추가.

### 1.8 `photos`
공유 앨범(§5.4). place_id·trip_id 둘 다 null = 미분류 정식 상태.

| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid | PK |
| couple_id | uuid | NOT NULL FK→couples(id) |
| storage_url | text | NOT NULL (Supabase Storage 원본) |
| thumbnail_url | text | NULL (썸네일 지연로딩) |
| place_id | uuid | NULL FK→places(id) |
| trip_id | uuid | NULL FK→trips(id) |
| taken_at | timestamptz | NULL (EXIF 촬영시각) |
| exif_lat | double precision | NULL |
| exif_lng | double precision | NULL |
| classified_by | text | NOT NULL CHECK in ('AUTO','MANUAL','UNCLASSIFIED') DEFAULT 'UNCLASSIFIED' |
| uploaded_by | uuid | NOT NULL FK→profiles(id) |
| caption | text | NULL |
| (감사/동기화 6필드) | | |

### 1.9 `events`
3트랙 공유 캘린더(§4.2·§5.1). 색은 런타임 도출(저장 안 함).

| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid | PK |
| couple_id | uuid | NOT NULL FK→couples(id) |
| title | text | NOT NULL |
| start | timestamptz | NOT NULL |
| "end" | timestamptz | NOT NULL CHECK ("end" >= start) (예약어→따옴표) |
| is_all_day | boolean | NOT NULL DEFAULT false |
| time_zone | text | NOT NULL DEFAULT 'Asia/Seoul' (IANA) |
| recurrence_rule | text | NULL (RRULE; 회차 예외는 EXDATE/RECURRENCE-ID) |
| visibility | text | NOT NULL CHECK in ('PERSONAL','SHARED') DEFAULT 'SHARED' |
| participants | text | NOT NULL CHECK in ('OWNER_ONLY','BOTH') DEFAULT 'BOTH' |
| owner_id | uuid | NOT NULL FK→profiles(id) |
| place_id | uuid | NULL FK→places(id) |
| itinerary_id | uuid | NULL FK→itineraries(id) (코스 출처 §5.6) |
| reminders | jsonb | NOT NULL DEFAULT '[]' ([{userId, offsetMinutes}] 사용자별) |
| memo | text | NULL |
| (감사/동기화 6필드) | | |

### 1.10 `itineraries`
AI 코스(§5.6). days는 JSON blob.

| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid | PK |
| couple_id | uuid | NOT NULL FK→couples(id) |
| trip_id | uuid | NULL FK→trips(id) |
| days | jsonb | NOT NULL DEFAULT '[]' (days[]→stops[]{place_id,도착시각,체류분,이동메모,추천이유}) |
| created_by | uuid | NOT NULL FK→profiles(id) |
| (감사/동기화 6필드) | | |

- `days[].stops[].place_id`는 입력 화이트리스트 검증을 통과한 값만(§5.6 — DB 제약 아님, 프록시/앱 계약).

### 1.11 `reactions`
가벼운 리액션(§4.2·§8). Wish.priority 하트와 분리.

| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid | PK |
| couple_id | uuid | NOT NULL FK→couples(id) |
| user_id | uuid | NOT NULL FK→profiles(id) |
| target_type | text | NOT NULL CHECK in ('PLACE','PHOTO','VISIT') |
| target_id | uuid | NOT NULL (다형 참조, FK 없음) |
| emoji | text | NOT NULL |
| (감사/동기화 6필드) | | |

- UNIQUE (user_id, target_type, target_id, emoji) WHERE deleted_at IS NULL — 같은 리액션 중복 방지. `target_id` 다형이라 FK 불가 → 무결성은 앱 레이어.

---

## 2. wish/visit 도출 규칙 (§4.2)

`places.status` 컬럼 없음. 화면의 "가고싶은/가본" 필터는 도출값으로 계산.

```sql
-- 가고싶은 (전체/내것):  wishes 존재 여부
-- 가봤음:                visits 존재 여부 (Visit≥1 ⇔ visited 불변식)
```

장소별 상태 뷰(읽기 편의, 마커/필터용):

```sql
CREATE VIEW v_place_status AS
SELECT
  p.id AS place_id,
  p.couple_id,
  EXISTS (SELECT 1 FROM wishes w
            WHERE w.place_id = p.id AND w.deleted_at IS NULL)               AS is_wished,
  EXISTS (SELECT 1 FROM visits v
            WHERE v.place_id = p.id AND v.deleted_at IS NULL)               AS is_visited,
  ARRAY(  SELECT w.user_id FROM wishes w
            WHERE w.place_id = p.id AND w.deleted_at IS NULL)               AS wished_by
FROM places p
WHERE p.deleted_at IS NULL;
```

- 마커: `is_wished && !is_visited` = 빈 별, `is_visited` = 채운 별+체크(§5.5). 색만으로 구분 금지 → 패턴/라벨 병기.
- "가본 곳 또 가고싶음" = 같은 place에 visit 존재 + wish 존재 → 둘 다 true, 모순 아님.
- status 캐시 컬럼이 필요해지면 `Visit≥1 ⇔ visited` 불변식을 트리거로 강제(§4.2).

---

## 3. 인덱스

```sql
-- couple_id: 전 공유 테이블 (RLS·조회 핵심)
CREATE INDEX idx_places_couple      ON places(couple_id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_wishes_couple      ON wishes(couple_id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_visits_couple      ON visits(couple_id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_trips_couple       ON trips(couple_id)       WHERE deleted_at IS NULL;
CREATE INDEX idx_photos_couple      ON photos(couple_id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_events_couple      ON events(couple_id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_itineraries_couple ON itineraries(couple_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_reactions_couple   ON reactions(couple_id)   WHERE deleted_at IS NULL;

-- kakao_place_id UNIQUE per couple (중복 점프 §5.2)
-- 값=네이버 장소ID — 네이버는 고유 ID가 없어 norm(name)|norm(address) 합성키 저장(normalize.ts).
-- 컬럼명·인덱스명(uq_places_couple_kakao)은 스키마 호환 위해 유지. 별도 naver_place_id 불필요. 중복 방지는 합성키로 동작.
CREATE UNIQUE INDEX uq_places_couple_kakao
  ON places(couple_id, kakao_place_id)
  WHERE kakao_place_id IS NOT NULL AND deleted_at IS NULL;

-- couples 초대코드: 활성 PENDING 중 유일
CREATE UNIQUE INDEX uq_couples_invite_code
  ON couples(invite_code)
  WHERE invite_code IS NOT NULL AND status = 'PENDING';

-- wish 1인1장소
CREATE UNIQUE INDEX uq_wishes_place_user
  ON wishes(place_id, user_id) WHERE deleted_at IS NULL;

-- reaction 중복 방지
CREATE UNIQUE INDEX uq_reactions_unique
  ON reactions(user_id, target_type, target_id, emoji) WHERE deleted_at IS NULL;

-- 조회 보조
CREATE INDEX idx_wishes_place    ON wishes(place_id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_visits_place    ON visits(place_id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_visits_trip     ON visits(trip_id)       WHERE deleted_at IS NULL;
CREATE INDEX idx_photos_trip     ON photos(trip_id)       WHERE deleted_at IS NULL;
CREATE INDEX idx_photos_place    ON photos(place_id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_events_owner    ON events(owner_id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_events_range    ON events(couple_id, start) WHERE deleted_at IS NULL;
CREATE INDEX idx_places_region   ON places(region_code)   WHERE deleted_at IS NULL;
CREATE INDEX idx_reactions_target ON reactions(target_type, target_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_profiles_couple ON profiles(couple_id);
CREATE INDEX idx_regions_parent  ON regions(parent_code);
```

---

## 4. RLS 정책 (§10.2 — couple_id 기준 + visibility 다단계)

전 공유 테이블 RLS 활성. 헬퍼 함수로 호출자의 정본 couple_id를 구한다(profiles 캐시가 아니라 couples 정본 사용 권장).

```sql
-- 호출자의 ACTIVE/PENDING couple_id (정본: couples.user_a/user_b)
CREATE OR REPLACE FUNCTION current_couple_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT c.id FROM couples c
  WHERE (c.user_a = auth.uid() OR c.user_b = auth.uid())
    AND c.status <> 'DISCONNECTED'
  LIMIT 1
$$;

ALTER TABLE places ENABLE ROW LEVEL SECURITY;
-- (전 공유 테이블 동일하게 ENABLE)

-- 표준 격리: 내 커플의 살아있는 행만
CREATE POLICY places_couple_isolation ON places
  FOR ALL
  USING      (couple_id = current_couple_id() AND deleted_at IS NULL)
  WITH CHECK (couple_id = current_couple_id());
```

**events — visibility 다단계 (§4.2·§5.1):**
둘은 한 캘린더 공유라 PERSONAL도 서로 보이고 색만 소유자로 갈림. 따라서 SELECT는 couple 전체 허용, 단 쓰기(수정/삭제)는 소유자만으로 좁힌다.

```sql
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- 읽기: 같은 커플이면 PERSONAL/SHARED 모두 보임
CREATE POLICY events_select ON events
  FOR SELECT USING (couple_id = current_couple_id() AND deleted_at IS NULL);

-- 생성: 내가 owner, 내 커플
CREATE POLICY events_insert ON events
  FOR INSERT WITH CHECK (couple_id = current_couple_id() AND owner_id = auth.uid());

-- 수정/삭제(soft): SHARED는 둘 다, PERSONAL은 소유자만
CREATE POLICY events_update ON events
  FOR UPDATE
  USING (couple_id = current_couple_id()
         AND (visibility = 'SHARED' OR owner_id = auth.uid()))
  WITH CHECK (couple_id = current_couple_id());
```

- `reactions`/`wishes`처럼 user_id가 있는 테이블: 읽기는 커플 전체(상대 리액션 보임), 본인 행만 쓰기(`user_id = auth.uid()`)로 좁힐 수 있음.
- soft-delete는 UPDATE(`deleted_at` 채움)로 수행되므로 DELETE 정책 대신 UPDATE 정책으로 통제. 물리 DELETE는 RLS로 막거나 권한 회수.
- `regions`는 모두 읽기 허용(글로벌 마스터), 쓰기는 service_role/마이그레이션만.

---

## 5. CREATE TABLE 골격 (마이그레이션 출발점)

> 순서 주의: regions → couples → profiles → places → trips → wishes/visits/photos/events/itineraries/reactions. 순환 FK(trips.cover_photo_id ↔ photos.trip_id)는 마지막에 ALTER로 추가. 감사/동기화 6필드는 재사용 위해 매크로처럼 반복(아래는 places 예시에 전개, 나머지는 동일 블록).

```sql
-- 0) regions (글로벌, 감사필드 없음)
CREATE TABLE regions (
  code        text PRIMARY KEY,
  label       text NOT NULL,
  parent_code text REFERENCES regions(code)
);

-- 1) couples
CREATE TABLE couples (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a            uuid NOT NULL,                 -- FK→profiles 후행 ALTER (순환)
  user_b            uuid,
  status            text NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','ACTIVE','DISCONNECTED')),
  invite_code       text,
  invite_expires_at timestamptz,
  connected_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           integer NOT NULL DEFAULT 1,
  CHECK (user_b IS NULL OR user_b <> user_a)
);

-- 2) profiles (= USER; auth.users 확장)
CREATE TABLE profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id    uuid REFERENCES couples(id),        -- 캐시(정본=couples)
  display_name text NOT NULL,
  avatar_url   text,
  color        text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  version      integer NOT NULL DEFAULT 1
);
ALTER TABLE couples ADD CONSTRAINT couples_user_a_fk
  FOREIGN KEY (user_a) REFERENCES profiles(id);
ALTER TABLE couples ADD CONSTRAINT couples_user_b_fk
  FOREIGN KEY (user_b) REFERENCES profiles(id);

-- 3) places  (감사/동기화 6필드 전개 — 다른 공유 테이블도 동일 블록)
CREATE TABLE places (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id      uuid NOT NULL REFERENCES couples(id),
  name           text NOT NULL,
  address        text,
  region_code    text REFERENCES regions(code),
  region_label   text,
  lat            double precision,
  lng            double precision,
  category       text,                              -- 네이버 카테고리
  kakao_place_id text,                              -- 값=네이버 장소ID(norm(name)|norm(address) 합성키, normalize.ts); 컬럼명 스키마 호환 위해 유지(별도 naver_place_id 불필요)
  tags           text[] NOT NULL DEFAULT '{}',
  memo           text,
  added_by       uuid NOT NULL REFERENCES profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL REFERENCES profiles(id),
  updated_by     uuid NOT NULL REFERENCES profiles(id),
  deleted_at     timestamptz,
  version        integer NOT NULL DEFAULT 1
);

-- 4) trips (cover_photo_id FK는 photos 생성 후 ALTER)
CREATE TABLE trips (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id    uuid NOT NULL REFERENCES couples(id),
  title        text NOT NULL,
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  region_code  text REFERENCES regions(code),
  cover_photo_id uuid,                              -- FK 후행 ALTER
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES profiles(id),
  updated_by uuid NOT NULL REFERENCES profiles(id),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1,
  CHECK (end_date >= start_date)
);

-- 5) wishes
CREATE TABLE wishes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id  uuid NOT NULL REFERENCES couples(id),
  place_id   uuid NOT NULL REFERENCES places(id),
  user_id    uuid NOT NULL REFERENCES profiles(id),
  priority   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES profiles(id),
  updated_by uuid NOT NULL REFERENCES profiles(id),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1
);

-- 6) visits
CREATE TABLE visits (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id  uuid NOT NULL REFERENCES couples(id),
  place_id   uuid NOT NULL REFERENCES places(id),
  trip_id    uuid REFERENCES trips(id),
  visit_date date,
  rating     integer CHECK (rating BETWEEN 1 AND 5),
  memo       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES profiles(id),
  updated_by uuid NOT NULL REFERENCES profiles(id),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1
);

-- 7) photos
CREATE TABLE photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id     uuid NOT NULL REFERENCES couples(id),
  storage_url   text NOT NULL,
  thumbnail_url text,
  place_id      uuid REFERENCES places(id),
  trip_id       uuid REFERENCES trips(id),
  taken_at      timestamptz,
  exif_lat      double precision,
  exif_lng      double precision,
  classified_by text NOT NULL DEFAULT 'UNCLASSIFIED'
                  CHECK (classified_by IN ('AUTO','MANUAL','UNCLASSIFIED')),
  uploaded_by   uuid NOT NULL REFERENCES profiles(id),
  caption       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES profiles(id),
  updated_by uuid NOT NULL REFERENCES profiles(id),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1
);
ALTER TABLE trips ADD CONSTRAINT trips_cover_photo_fk
  FOREIGN KEY (cover_photo_id) REFERENCES photos(id) ON DELETE SET NULL;

-- 8) itineraries
CREATE TABLE itineraries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id  uuid NOT NULL REFERENCES couples(id),
  trip_id    uuid REFERENCES trips(id),
  days       jsonb NOT NULL DEFAULT '[]',
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES profiles(id),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1
);

-- 9) events  ("end"는 예약어 → 따옴표)
CREATE TABLE events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id       uuid NOT NULL REFERENCES couples(id),
  title           text NOT NULL,
  start           timestamptz NOT NULL,
  "end"           timestamptz NOT NULL,
  is_all_day      boolean NOT NULL DEFAULT false,
  time_zone       text NOT NULL DEFAULT 'Asia/Seoul',
  recurrence_rule text,
  visibility      text NOT NULL DEFAULT 'SHARED'
                    CHECK (visibility IN ('PERSONAL','SHARED')),
  participants    text NOT NULL DEFAULT 'BOTH'
                    CHECK (participants IN ('OWNER_ONLY','BOTH')),
  owner_id        uuid NOT NULL REFERENCES profiles(id),
  place_id        uuid REFERENCES places(id),
  itinerary_id    uuid REFERENCES itineraries(id),
  reminders       jsonb NOT NULL DEFAULT '[]',
  memo            text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES profiles(id),
  updated_by uuid NOT NULL REFERENCES profiles(id),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1,
  CHECK ("end" >= start)
);

-- 10) reactions (target_id 다형 → FK 없음)
CREATE TABLE reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id   uuid NOT NULL REFERENCES couples(id),
  user_id     uuid NOT NULL REFERENCES profiles(id),
  target_type text NOT NULL CHECK (target_type IN ('PLACE','PHOTO','VISIT')),
  target_id   uuid NOT NULL,
  emoji       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES profiles(id),
  updated_by uuid NOT NULL REFERENCES profiles(id),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1
);
```

---

## 6. 트리거 (선택, 권장)

```sql
-- updated_at 자동 갱신 (version은 앱이 명시 증가 — 낙관적 락)
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
-- 각 공유 테이블에 BEFORE UPDATE 트리거 부착.
```

- Realtime: 공유 테이블을 `supabase_realtime` publication에 추가해 변경 자동 전파(§5.1·P1 공유). `deleted_at` 변화도 이벤트로 흘러 휴지통/충돌 UI에 반영.
- 오프라인 큐잉/낙관적 락은 클라이언트(TanStack Query + 로컬 큐)와 `version` 조건부 update 조합으로 구현(§4.3, P1부터 테스트).

---

## 7. 무결성 요약 (DB로 못 거는 것 = 앱/프록시 계약)

- 멤버 ≤2, `profiles.couple_id` ↔ `couples.user_a/user_b` 정합 → 앱 레이어(§4.2).
- `trips.cover_photo_id` 같은 couple 보장, 사진 삭제 시 null → ON DELETE SET NULL + 앱 검증.
- `reactions.target_id` 다형 참조 무결성 → 앱.
- `itineraries.days[].stops[].place_id` 화이트리스트(입력 place_id 집합 내) → 프록시/앱(§5.6).
- `Visit≥1 ⇔ visited` 불변식(status 캐시 둘 경우) → 트리거/앱.
- 영업시간 환각 금지·도착시각 결정론 재계산 → 데이터 모델엔 영업시간 컬럼 없음으로 구조적 차단(§5.6).
