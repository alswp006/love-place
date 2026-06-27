-- 0016 R6 GPS 여행 동선 기록 — trip_sessions / route_points(좌표 암호화) / location_access_log(확인자료) / consent_log
--
-- 설계: docs/superpowers/specs/2026-06-27-r6-journey-recording-design.md §3
-- 관례(0001~0005): couple_id FK · created_at/updated_at/created_by/updated_by · deleted_at(soft-delete)
--   · version(낙관적 락) · 부분 인덱스 WHERE deleted_at IS NULL · RLS current_couple_id() · GRANT(authenticated)
--   · touch_updated_at 트리거 · realtime publication.
-- 위치정보법 예외:
--   • route_points 좌표는 평문 컬럼 없음 — lat_enc/lng_enc(bytea, pgcrypto). insert/select는 0017 RPC 경유
--     (클라에 GRANT 주지 않음 → 키 없는 직접 접근 차단). RLS는 방어선으로 유지.
--   • route_points는 realtime publication 미추가(암호화 payload 무의미) — 세션 신호는 trip_sessions로 전파.
--   • location_access_log = 확인자료(제16조2): append-only. UPDATE/DELETE 정책 없음 → authenticated 변경 불가,
--     파기는 0017 service_role 잡만(보존기간 만료/철회 동반).
--   • 좌표/확인자료의 '하드 파기'(제23·24조)는 글로벌 soft-delete의 의도적 예외(0017 purge_* 참조).
-- 멱등: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS 후 CREATE(0012 패턴). 재푸시 무해.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- 1) trip_sessions — 기록 세션(시작~종료), route_points의 부모
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trip_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id           uuid NOT NULL REFERENCES public.couples(id),
  trip_id             uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  owner_id            uuid NOT NULL REFERENCES public.profiles(id),  -- 개인위치정보주체(동선 주인)
  status              text NOT NULL DEFAULT 'RECORDING'
                        CHECK (status IN ('RECORDING','PAUSED','DONE','DISCARDED')),
  started_at          timestamptz NOT NULL DEFAULT now(),
  ended_at            timestamptz,
  point_count         integer NOT NULL DEFAULT 0,
  recorded_distance_m integer,
  purge_after         timestamptz,                                  -- 철회/목적달성 시 파기 예약
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL REFERENCES public.profiles(id),
  updated_by          uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at          timestamptz,
  version             integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_trip_sessions_couple ON public.trip_sessions(couple_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_trip_sessions_trip   ON public.trip_sessions(trip_id)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_trip_sessions_purge  ON public.trip_sessions(purge_after) WHERE purge_after IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2) route_points — 개인위치정보 본체(좌표 암호화). insert/select는 0017 RPC 전용.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.route_points (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id       uuid NOT NULL REFERENCES public.couples(id),
  session_id      uuid NOT NULL REFERENCES public.trip_sessions(id) ON DELETE CASCADE,
  owner_id        uuid NOT NULL REFERENCES public.profiles(id),
  lat_enc         bytea NOT NULL,                       -- pgp_sym_encrypt(lat::text, key)
  lng_enc         bytea NOT NULL,
  accuracy_m      real,
  speed_mps       real,
  recorded_at     timestamptz NOT NULL,                 -- 기기 측정 시각(정렬·거리 기준)
  client_point_id text NOT NULL,                        -- 오프라인 큐 멱등키
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at      timestamptz,                          -- 관례 일관(법적 파기는 0017 하드 DELETE)
  version         integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_route_points_idem    ON public.route_points(session_id, client_point_id);
CREATE INDEX        IF NOT EXISTS idx_route_points_session ON public.route_points(session_id, recorded_at) WHERE deleted_at IS NULL;
CREATE INDEX        IF NOT EXISTS idx_route_points_couple  ON public.route_points(couple_id) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 3) location_access_log — 확인자료(제16조2). append-only.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.location_access_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id       uuid NOT NULL REFERENCES public.couples(id),
  data_subject_id uuid NOT NULL REFERENCES public.profiles(id),  -- 동선 주인
  actor_id        uuid REFERENCES public.profiles(id),           -- 취급자(시스템 수집 시 = subject)
  event_type      text NOT NULL CHECK (event_type IN ('COLLECT','USE','PROVIDE')),
  event_at        timestamptz NOT NULL DEFAULT now(),
  purpose         text NOT NULL,
  recipient_id    uuid REFERENCES public.profiles(id),           -- PROVIDE 시 = 상대
  session_ref     uuid,                                          -- FK 미설정: 본체 파기 후에도 메타 생존
  retain_until    timestamptz NOT NULL,                          -- event_at + 보존기간(6개월)
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at      timestamptz,
  version         integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_lal_couple  ON public.location_access_log(couple_id);
CREATE INDEX IF NOT EXISTS idx_lal_subject ON public.location_access_log(data_subject_id, event_at);
CREATE INDEX IF NOT EXISTS idx_lal_retain  ON public.location_access_log(retain_until);

-- ─────────────────────────────────────────────────────────────
-- 4) consent_log — 4종 동의 감사. append-only.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consent_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id),
  couple_id       uuid REFERENCES public.couples(id),
  consent_type    text NOT NULL CHECK (consent_type IN
                    ('COLLECT_USE','THIRD_PARTY_PROVIDE_PARTNER','NOTIFY_METHOD','RESERVE_NOTICE_ACK')),
  scope           text CHECK (scope IN ('RECAP','REALTIME')),
  granted         boolean NOT NULL,
  notify_mode     text CHECK (notify_mode IN ('IMMEDIATE','BATCHED_30D')),
  policy_version  text NOT NULL,
  shown_text_hash text NOT NULL,
  granted_at      timestamptz,
  withdrawn_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_consent_user ON public.consent_log(user_id, consent_type);

-- ─────────────────────────────────────────────────────────────
-- 5) GRANT (authenticated) — 0004 패턴.
--    route_points는 GRANT 미부여(0017 RPC 전용). 나머지는 행 제한을 RLS가 담당.
--    location_access_log/consent_log은 SELECT/INSERT만(append-only).
-- ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_sessions       TO authenticated;
GRANT SELECT, INSERT                 ON public.location_access_log  TO authenticated;
GRANT SELECT, INSERT                 ON public.consent_log          TO authenticated;
-- route_points: 의도적 미부여(RPC SECURITY DEFINER 경유).

-- ─────────────────────────────────────────────────────────────
-- 6) RLS ENABLE + 정책 (0004/0012 골격)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.trip_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_points        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_log         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trip_sessions_couple ON public.trip_sessions;
CREATE POLICY trip_sessions_couple ON public.trip_sessions
  FOR ALL USING (couple_id = public.current_couple_id() AND deleted_at IS NULL)
          WITH CHECK (couple_id = public.current_couple_id());

-- route_points: 방어선(직접 접근은 GRANT 부재로 이미 차단). RPC는 SECURITY DEFINER로 자체 검증.
DROP POLICY IF EXISTS route_points_couple ON public.route_points;
CREATE POLICY route_points_couple ON public.route_points
  FOR ALL USING (couple_id = public.current_couple_id() AND deleted_at IS NULL)
          WITH CHECK (couple_id = public.current_couple_id());

-- 확인자료: SELECT/INSERT만. UPDATE/DELETE 정책 없음 → authenticated 불가(파기는 service_role 잡, 0017).
DROP POLICY IF EXISTS lal_select ON public.location_access_log;
CREATE POLICY lal_select ON public.location_access_log
  FOR SELECT USING (couple_id = public.current_couple_id());
DROP POLICY IF EXISTS lal_insert ON public.location_access_log;
CREATE POLICY lal_insert ON public.location_access_log
  FOR INSERT WITH CHECK (couple_id = public.current_couple_id());

-- 동의 로그: 본인 것 + 상대 "동의함" 가시(0014 철학). INSERT는 본인만.
DROP POLICY IF EXISTS consent_select ON public.consent_log;
CREATE POLICY consent_select ON public.consent_log
  FOR SELECT USING (user_id = auth.uid() OR couple_id = public.current_couple_id());
DROP POLICY IF EXISTS consent_insert ON public.consent_log;
CREATE POLICY consent_insert ON public.consent_log
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 7) updated_at 트리거 (0003 touch_updated_at 재사용) — trip_sessions만(나머지 append-only/immutable)
-- ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_touch_trip_sessions ON public.trip_sessions;
CREATE TRIGGER trg_touch_trip_sessions BEFORE UPDATE ON public.trip_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 8) Realtime publication (0005 패턴) — 세션 상태/교차기기 동기화 신호.
--    route_points는 암호화 payload라 미추가(클라가 trip_sessions 변경 시 get_session_points 재조회).
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'trip_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_sessions;
  END IF;
END $$;
