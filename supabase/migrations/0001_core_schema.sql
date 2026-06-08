-- 0001 코어 스키마 — love_place (설계서 §4 / .ai-factory/02-data-model.md)
-- 전 테이블 snake_case, uuid PK, timestamptz(UTC), 공유 테이블엔 couple_id + 감사/동기화 6필드.
-- 생성 순서: regions → couples → profiles → places → trips → wishes/visits/photos/itineraries/events/reactions.
-- 순환 FK(couples↔profiles, trips↔photos)는 후행 ALTER로 추가.

-- ─────────────────────────────────────────────────────────────
-- 0) regions (글로벌 마스터, 감사필드 없음 — 커플 무관 §4.2)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.regions (
  code        text PRIMARY KEY,                       -- 법정동 b_code 접두(예: "51210" 강원 속초)
  label       text NOT NULL,                          -- 표시명(예: "속초")
  parent_code text REFERENCES public.regions(code)
);

-- ─────────────────────────────────────────────────────────────
-- 1) couples — 커플 묶음·초대 상태(멤버십 정본 §4.2)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.couples (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a            uuid NOT NULL,                     -- FK→profiles 후행 ALTER(순환)
  user_b            uuid,                              -- 연결 전 null
  status            text NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','ACTIVE','DISCONNECTED')),
  invite_code       text,
  invite_expires_at timestamptz,
  connected_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           integer NOT NULL DEFAULT 1,
  CHECK (user_b IS NULL OR user_b <> user_a)          -- 자기 자신 연결 금지
);

-- ─────────────────────────────────────────────────────────────
-- 2) profiles (= USER; auth.users 1:1 확장)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id    uuid REFERENCES public.couples(id),     -- 캐시(정본=couples.user_a/user_b)
  display_name text NOT NULL DEFAULT '',
  avatar_url   text,
  color        text NOT NULL DEFAULT '#3b6db5',        -- 트랙 색(내=블루 기본)
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  version      integer NOT NULL DEFAULT 1
);

-- 순환 FK 해소: couples.user_a/user_b → profiles
ALTER TABLE public.couples
  ADD CONSTRAINT couples_user_a_fk FOREIGN KEY (user_a) REFERENCES public.profiles(id);
ALTER TABLE public.couples
  ADD CONSTRAINT couples_user_b_fk FOREIGN KEY (user_b) REFERENCES public.profiles(id);

-- ─────────────────────────────────────────────────────────────
-- 3) places — 공유 장소(§5.2). 카카오 검색 결과 정규화.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.places (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id      uuid NOT NULL REFERENCES public.couples(id),
  name           text NOT NULL,
  address        text,
  region_code    text REFERENCES public.regions(code),
  region_label   text,
  lat            double precision,
  lng            double precision,
  category       text,
  kakao_place_id text,                                 -- UNIQUE per couple(부분 인덱스 0002)
  tags           text[] NOT NULL DEFAULT '{}',
  memo           text,
  added_by       uuid NOT NULL REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL REFERENCES public.profiles(id),
  updated_by     uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at     timestamptz,
  version        integer NOT NULL DEFAULT 1
);

-- ─────────────────────────────────────────────────────────────
-- 4) trips — 여행 묶음(§5.3). cover_photo_id FK는 photos 생성 후 ALTER.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.trips (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id      uuid NOT NULL REFERENCES public.couples(id),
  title          text NOT NULL,
  start_date     date NOT NULL,
  end_date       date NOT NULL,
  region_code    text REFERENCES public.regions(code),
  cover_photo_id uuid,                                 -- FK 후행 ALTER(순환)
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL REFERENCES public.profiles(id),
  updated_by     uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at     timestamptz,
  version        integer NOT NULL DEFAULT 1,
  CHECK (end_date >= start_date)
);

-- ─────────────────────────────────────────────────────────────
-- 5) wishes — 가고싶음 = per-user 의도(§4.2). 상태가 아니라 도출.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.wishes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id  uuid NOT NULL REFERENCES public.couples(id),
  place_id   uuid NOT NULL REFERENCES public.places(id),
  user_id    uuid NOT NULL REFERENCES public.profiles(id),  -- 누가 찜
  priority   integer NOT NULL DEFAULT 0,                     -- 하트 우선순위
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_by uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1
);

-- ─────────────────────────────────────────────────────────────
-- 6) visits — 가봤음 = 파생 기록(§5.3). 재방문 각각 행.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.visits (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id  uuid NOT NULL REFERENCES public.couples(id),
  place_id   uuid NOT NULL REFERENCES public.places(id),
  trip_id    uuid REFERENCES public.trips(id),
  visit_date date,
  rating     integer CHECK (rating BETWEEN 1 AND 5),
  memo       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_by uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1
);

-- ─────────────────────────────────────────────────────────────
-- 7) photos — 공유 앨범(§5.4). place_id·trip_id 둘 다 null = 미분류 정식 상태.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id     uuid NOT NULL REFERENCES public.couples(id),
  storage_url   text NOT NULL,
  thumbnail_url text,
  place_id      uuid REFERENCES public.places(id),
  trip_id       uuid REFERENCES public.trips(id),
  taken_at      timestamptz,
  exif_lat      double precision,
  exif_lng      double precision,
  classified_by text NOT NULL DEFAULT 'UNCLASSIFIED'
                  CHECK (classified_by IN ('AUTO','MANUAL','UNCLASSIFIED')),
  uploaded_by   uuid NOT NULL REFERENCES public.profiles(id),
  caption       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL REFERENCES public.profiles(id),
  updated_by    uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at    timestamptz,
  version       integer NOT NULL DEFAULT 1
);

-- trips.cover_photo_id → photos (사진 삭제 시 null 폴백 §4.2)
ALTER TABLE public.trips
  ADD CONSTRAINT trips_cover_photo_fk
  FOREIGN KEY (cover_photo_id) REFERENCES public.photos(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────
-- 8) itineraries — AI 코스(§5.6). days는 JSON blob.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.itineraries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id  uuid NOT NULL REFERENCES public.couples(id),
  trip_id    uuid REFERENCES public.trips(id),
  days       jsonb NOT NULL DEFAULT '[]',              -- days[]→stops[]{place_id,도착시각,체류분,이동메모,추천이유}
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_by uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1
);

-- ─────────────────────────────────────────────────────────────
-- 9) events — 3트랙 공유 캘린더(§4.2·§5.1). 색은 런타임 도출(저장 안 함).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id       uuid NOT NULL REFERENCES public.couples(id),
  title           text NOT NULL,
  start           timestamptz NOT NULL,
  "end"           timestamptz NOT NULL,                -- 예약어 → 따옴표
  is_all_day      boolean NOT NULL DEFAULT false,
  time_zone       text NOT NULL DEFAULT 'Asia/Seoul',  -- IANA
  recurrence_rule text,                                -- RRULE; 회차 예외는 EXDATE/RECURRENCE-ID
  visibility      text NOT NULL DEFAULT 'SHARED'
                    CHECK (visibility IN ('PERSONAL','SHARED')),
  participants    text NOT NULL DEFAULT 'BOTH'
                    CHECK (participants IN ('OWNER_ONLY','BOTH')),
  owner_id        uuid NOT NULL REFERENCES public.profiles(id),
  place_id        uuid REFERENCES public.places(id),
  itinerary_id    uuid REFERENCES public.itineraries(id),
  reminders       jsonb NOT NULL DEFAULT '[]',         -- [{userId, offsetMinutes}] 사용자별
  memo            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL REFERENCES public.profiles(id),
  updated_by      uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at      timestamptz,
  version         integer NOT NULL DEFAULT 1,
  CHECK ("end" >= start)
);

-- ─────────────────────────────────────────────────────────────
-- 10) reactions — 가벼운 리액션(§4.2·§8). target_id 다형 → FK 없음.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id   uuid NOT NULL REFERENCES public.couples(id),
  user_id     uuid NOT NULL REFERENCES public.profiles(id),
  target_type text NOT NULL CHECK (target_type IN ('PLACE','PHOTO','VISIT')),
  target_id   uuid NOT NULL,
  emoji       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL REFERENCES public.profiles(id),
  updated_by  uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at  timestamptz,
  version     integer NOT NULL DEFAULT 1
);
