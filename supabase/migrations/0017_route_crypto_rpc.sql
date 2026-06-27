-- 0017 좌표 암호화 RPC + 하드 파기 잡 — R6 (설계 §3.2~3.5, §5[4][5])
--
-- 좌표 키: Supabase Vault 시크릿 'loc_point_key'(32B). 마이그레이션은 placeholder를 멱등 생성하고,
--   운영에서 vault.create_secret 또는 Studio로 교체한다. 키는 SECURITY DEFINER 함수만 읽는다(클라 미노출).
-- route_points는 GRANT가 없으므로(0016) 모든 insert/select는 아래 RPC(SECURITY DEFINER)로만 가능.
-- 확인자료(제16조2)는 RPC가 서버에서 원자 기록 — COLLECT(수집 시)·PROVIDE(상대 열람 시, 일 1회 디듑).
-- 하드 파기(제23·24조)는 글로벌 soft-delete의 의도적 예외 — service_role 전용.

CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- 0) 좌표 키 보장(placeholder; 운영 교체) ---------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'loc_point_key') THEN
    -- 키 = 64 hex(256bit). gen_random_uuid()는 코어(pg_catalog)라 스키마 무관 — pgcrypto gen_random_bytes는
    -- Supabase에서 extensions 스키마라 search_path 의존 → 회피.
    PERFORM vault.create_secret(
            replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
            'loc_point_key', 'R6 route_points 좌표 대칭암호 키');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._loc_key()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'loc_point_key' LIMIT 1
$$;
REVOKE ALL ON FUNCTION public._loc_key() FROM public, anon, authenticated;

-- 동의 상태 헬퍼 — 해당 사용자의 consent_type 최신행 granted(없으면 false). 서버단 동의 강제용.
CREATE OR REPLACE FUNCTION public._has_consent(p_user uuid, p_type text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT granted FROM public.consent_log
     WHERE user_id = p_user AND consent_type = p_type
     ORDER BY created_at DESC LIMIT 1), false)
$$;
REVOKE ALL ON FUNCTION public._has_consent(uuid, text) FROM public, anon, authenticated;

-- 1) record_points — 좌표 암호화 insert(멱등) + COLLECT 확인자료 -----------------
CREATE OR REPLACE FUNCTION public.record_points(p_session uuid, p_points jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_couple uuid; v_owner uuid; v_status text;
  v_key    text := public._loc_key();
  v_caller uuid := auth.uid();
  v_n      integer;
BEGIN
  SELECT couple_id, owner_id, status INTO v_couple, v_owner, v_status
  FROM public.trip_sessions
  WHERE id = p_session AND couple_id = public.current_couple_id() AND deleted_at IS NULL;

  IF v_couple IS NULL THEN
    RAISE EXCEPTION 'session not found or not in caller couple';
  END IF;
  -- 활성 세션(RECORDING/PAUSED)만 점 수용 — 종료 직전 큐 drain이 게이트를 통과하도록(막판 점 유실 방지).
  -- DONE/DISCARDED(닫힌 세션)는 거부. 조립측은 stop→drain→DONE 순서로 호출.
  IF v_status NOT IN ('RECORDING', 'PAUSED') THEN
    RAISE EXCEPTION 'session not active (status=%)', v_status;
  END IF;
  -- 수집·이용 동의 서버 강제(제18조) — 앱단 게이트와 이중화. 철회 즉시 새 점 거부.
  IF NOT public._has_consent(v_owner, 'COLLECT_USE') THEN
    RAISE EXCEPTION 'location collection not consented';
  END IF;

  INSERT INTO public.route_points
    (couple_id, session_id, owner_id, lat_enc, lng_enc, accuracy_m, speed_mps, recorded_at, client_point_id, created_by)
  SELECT
    v_couple, p_session, v_owner,
    pgp_sym_encrypt(pt->>'lat', v_key),
    pgp_sym_encrypt(pt->>'lng', v_key),
    NULLIF(pt->>'accuracy_m','')::real,
    NULLIF(pt->>'speed_mps','')::real,
    (pt->>'recorded_at')::timestamptz,
    pt->>'client_point_id',
    v_caller
  FROM jsonb_array_elements(p_points) AS pt
  ON CONFLICT (session_id, client_point_id) DO NOTHING;

  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n > 0 THEN
    UPDATE public.trip_sessions SET point_count = point_count + v_n WHERE id = p_session;
    INSERT INTO public.location_access_log
      (couple_id, data_subject_id, actor_id, event_type, purpose, session_ref, retain_until, created_by)
    VALUES
      (v_couple, v_owner, v_caller, 'COLLECT', '여행 동선 기록', p_session, now() + interval '6 months', v_caller);
  END IF;

  RETURN v_n;
END $$;
GRANT EXECUTE ON FUNCTION public.record_points(uuid, jsonb) TO authenticated;

-- 2) get_session_points — 복호 read + PROVIDE 확인자료(상대 열람, 일 1회 디듑) -----
CREATE OR REPLACE FUNCTION public.get_session_points(p_session uuid)
RETURNS TABLE(recorded_at timestamptz, lat double precision, lng double precision, accuracy_m real)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_couple uuid; v_owner uuid;
  v_key    text := public._loc_key();
  v_caller uuid := auth.uid();
BEGIN
  SELECT couple_id, owner_id INTO v_couple, v_owner
  FROM public.trip_sessions
  WHERE id = p_session AND couple_id = public.current_couple_id() AND deleted_at IS NULL;

  IF v_couple IS NULL THEN
    RAISE EXCEPTION 'session not found or not in caller couple';
  END IF;

  -- 제3자 제공(제19조): 상대가 내 동선을 열람하는 경우.
  IF v_owner IS NOT NULL AND v_caller <> v_owner THEN
    -- ① 제공 동의 서버 강제 — owner가 제3자 제공에 동의하지 않았으면 좌표 반환 거부(UI 토글만 의존 금지).
    IF NOT public._has_consent(v_owner, 'THIRD_PARTY_PROVIDE_PARTNER') THEN
      RAISE EXCEPTION 'third-party provision not consented';
    END IF;
    -- ② PROVIDE 사실 기록(같은 세션·수신자 1일 1회 디듑).
    INSERT INTO public.location_access_log
      (couple_id, data_subject_id, actor_id, event_type, purpose, recipient_id, session_ref, retain_until, created_by)
    SELECT v_couple, v_owner, v_caller, 'PROVIDE', '상대에게 동선 제공(열람)', v_caller, p_session,
           now() + interval '6 months', v_caller
    WHERE NOT EXISTS (
      SELECT 1 FROM public.location_access_log
      WHERE session_ref = p_session AND recipient_id = v_caller
        AND event_type = 'PROVIDE' AND event_at > now() - interval '1 day'
    );
  END IF;

  RETURN QUERY
  SELECT rp.recorded_at,
         pgp_sym_decrypt(rp.lat_enc, v_key)::double precision,
         pgp_sym_decrypt(rp.lng_enc, v_key)::double precision,
         rp.accuracy_m
  FROM public.route_points rp
  WHERE rp.session_id = p_session AND rp.deleted_at IS NULL
  ORDER BY rp.recorded_at ASC;
END $$;
GRANT EXECUTE ON FUNCTION public.get_session_points(uuid) TO authenticated;

-- 3) purge_location_data — 동의 철회 하드 파기(제24조4) -------------------------------
-- 위치정보법 제24조4: 동의 철회 시 개인위치정보 + '확인자료'를 함께 파기한다.
--   → 이 함수는 철회 경로(location-purge Edge Function) 전용이므로 세션의 확인자료를 보존기간과
--     무관하게 전부 파기한다(평시 6개월 보존은 purge_expired_access_log 잡이 담당, 철회는 예외).
CREATE OR REPLACE FUNCTION public.purge_location_data(p_session uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  DELETE FROM public.route_points  WHERE session_id = p_session;   -- CASCADE 대비 명시
  DELETE FROM public.trip_sessions WHERE id = p_session;
  -- 철회 동반 파기 — 보존기간 무관하게 해당 세션 확인자료 전부 삭제(제24조4).
  DELETE FROM public.location_access_log WHERE session_ref = p_session;
END $$;
REVOKE ALL ON FUNCTION public.purge_location_data(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_location_data(uuid) TO service_role;

-- 4) purge_expired_access_log — 보존기간 만료 자동 파기(미파기 처벌 방지) ----------
CREATE OR REPLACE FUNCTION public.purge_expired_access_log()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.location_access_log WHERE retain_until < now();
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.purge_expired_access_log() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_access_log() TO service_role;

-- 5) purge_orphan_sessions — 미연결 세션 목적소멸 파기(좌표만, 확인자료는 6개월 보존 유지) ----
-- 어느 여행에도 안 붙고(trip_id NULL) 종료된(DONE) 세션이 N일 경과 = '목적 없음' → 좌표 파기.
-- 철회 파기(purge_location_data, 확인자료까지)와 구분: 여기선 수집 '사실'은 audit에 남긴다(제16조2 6개월).
-- route_points는 trip_sessions ON DELETE CASCADE라 세션 삭제 시 동반 삭제됨.
CREATE OR REPLACE FUNCTION public.purge_orphan_sessions(p_grace_days int DEFAULT 14)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.trip_sessions
  WHERE trip_id IS NULL
    AND status = 'DONE'
    AND ended_at IS NOT NULL
    AND ended_at < now() - (p_grace_days || ' days')::interval;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.purge_orphan_sessions(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_orphan_sessions(int) TO service_role;

-- pg_cron(일 1회) — Supabase에서 pg_cron 활성 후 1회 등록:
--   SELECT cron.schedule('purge-loc-access',   '0 4 * * *', $$ SELECT public.purge_expired_access_log(); $$);
--   SELECT cron.schedule('purge-orphan-sess',  '0 4 * * *', $$ SELECT public.purge_orphan_sessions(14); $$);
