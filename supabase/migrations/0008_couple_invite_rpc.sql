-- 0008 커플 초대·연결 RPC — love_place (P0d / 02-data-model §4.2 / security-privacy §3·§5)
-- 모든 상태전이는 SECURITY DEFINER RPC 3종으로만. 클라이언트의 couples 직접 쓰기는 잠근다(우회 차단).
-- 핵심: ① current_couple_id ACTIVE로 축소 ② couples write 정책 잠금 — 이 둘이 빠지면 보안 무력화.

-- pgcrypto(gen_random_bytes) 보장. Supabase는 보통 extensions 스키마에 설치돼 있으나 멱등 보장.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- 1) current_couple_id() — ACTIVE만(기존 0004는 <>DISCONNECTED라 PENDING도 매칭되던 버그)
--    search_path에 extensions·public을 둬 pgcrypto/테이블 참조가 환경 무관하게 동작.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_couple_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.id FROM public.couples c
  WHERE (c.user_a = auth.uid() OR c.user_b = auth.uid())
    AND c.status = 'ACTIVE'
  LIMIT 1
$$;

-- ─────────────────────────────────────────────────────────────
-- 2) 초대 코드 생성 — 8자 Base32(혼동문자 제외), pgcrypto 난수. 내부 전용.
--    pgcrypto가 extensions/public 어디 있든 찾도록 search_path를 명시 지정.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gen_invite_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32글자(혼동문자 I,O,0,1 제외)
  result text := '';
  b bytea := gen_random_bytes(8);
  i int;
BEGIN
  FOR i IN 0..7 LOOP
    -- 256은 32의 배수 → % 32 균등(모듈로 바이어스 없음)
    result := result || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  END LOOP;
  RETURN result;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 3) RPC: create_invite() — PENDING 초대 생성/재사용. jsonb {ok, code, expires_at} 또는 {ok:false, reason}
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_invite()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid; v_code text; v_exp timestamptz; v_tries int := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'AUTH_REQUIRED'); END IF;

  -- profiles 방어(트리거 레이스/실패 대비 FK 보장)
  INSERT INTO public.profiles (id, display_name) VALUES (v_uid, '') ON CONFLICT (id) DO NOTHING;

  -- 이미 ACTIVE면 거부
  IF EXISTS (SELECT 1 FROM public.couples
             WHERE (user_a = v_uid OR user_b = v_uid) AND status = 'ACTIVE') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ALREADY_COUPLED');
  END IF;

  -- 기존 PENDING(난립 방지): 안 만료면 그대로 반환
  SELECT id, invite_code, invite_expires_at INTO v_id, v_code, v_exp
    FROM public.couples WHERE user_a = v_uid AND status = 'PENDING' FOR UPDATE;
  IF FOUND AND v_exp > now() AND v_code IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'code', v_code, 'expires_at', v_exp);
  END IF;

  -- 코드 발급(유니크 충돌 재시도). 만료된 기존 PENDING은 재발급, 없으면 INSERT.
  LOOP
    v_tries := v_tries + 1;
    v_code := public.gen_invite_code();
    v_exp := now() + interval '48 hours';
    BEGIN
      IF v_id IS NOT NULL THEN
        UPDATE public.couples SET invite_code = v_code, invite_expires_at = v_exp, version = version + 1
          WHERE id = v_id;
      ELSE
        INSERT INTO public.couples (user_a, status, invite_code, invite_expires_at)
          VALUES (v_uid, 'PENDING', v_code, v_exp) RETURNING id INTO v_id;
      END IF;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_tries >= 5 THEN RAISE; END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'code', v_code, 'expires_at', v_exp);
END $$;

-- ─────────────────────────────────────────────────────────────
-- 4) RPC: accept_invite(p_code) — 원자적 검증+바인딩+캐시. 모든 엣지케이스 차단.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_invite(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_norm text; v_row public.couples%ROWTYPE; v_aff int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'AUTH_REQUIRED'); END IF;

  v_norm := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  IF length(v_norm) = 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'INVALID_CODE'); END IF;

  INSERT INTO public.profiles (id, display_name) VALUES (v_uid, '') ON CONFLICT (id) DO NOTHING;

  -- 수락자가 이미 ACTIVE면 거부
  IF EXISTS (SELECT 1 FROM public.couples
             WHERE (user_a = v_uid OR user_b = v_uid) AND status = 'ACTIVE') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ALREADY_COUPLED');
  END IF;

  -- PENDING + 코드 일치 행 잠금(동시성). 없으면 INVALID_CODE(미존재/이미수락 통합 — 오라클 차단)
  SELECT * INTO v_row FROM public.couples
    WHERE invite_code = v_norm AND status = 'PENDING' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'INVALID_CODE'); END IF;

  IF v_row.invite_expires_at IS NULL OR v_row.invite_expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'EXPIRED');
  END IF;

  IF v_row.user_a = v_uid THEN RETURN jsonb_build_object('ok', false, 'reason', 'SELF_INVITE'); END IF;

  -- 초대자 A가 그 사이 다른 ACTIVE가 됐는지
  IF EXISTS (SELECT 1 FROM public.couples x
             WHERE x.status = 'ACTIVE' AND x.id <> v_row.id
               AND (x.user_a = v_row.user_a OR x.user_b = v_row.user_a)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'PARTNER_TAKEN');
  END IF;

  -- 바인딩 + 1회용 폐기 + 낙관적 락. 조건부 UPDATE로 race 패배 판정.
  UPDATE public.couples
    SET user_b = v_uid, status = 'ACTIVE', connected_at = now(),
        invite_code = NULL, invite_expires_at = NULL, version = version + 1
    WHERE id = v_row.id AND status = 'PENDING';
  GET DIAGNOSTICS v_aff = ROW_COUNT;
  IF v_aff = 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'INVALID_CODE'); END IF;

  -- profiles.couple_id 캐시 동기화(양쪽)
  UPDATE public.profiles SET couple_id = v_row.id, version = version + 1
    WHERE id IN (v_row.user_a, v_uid);

  RETURN jsonb_build_object('ok', true, 'couple_id', v_row.id, 'status', 'ACTIVE');
END $$;

-- ─────────────────────────────────────────────────────────────
-- 5) RPC: disconnect_couple(p_couple_id) — 연결 해제(§5.1)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.disconnect_couple(p_couple_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.couples%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'AUTH_REQUIRED'); END IF;

  SELECT * INTO v_row FROM public.couples
    WHERE id = p_couple_id AND (user_a = v_uid OR user_b = v_uid) AND status = 'ACTIVE'
    FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'NOT_MEMBER_OR_NOT_ACTIVE'); END IF;

  UPDATE public.couples
    SET status = 'DISCONNECTED', invite_code = NULL, invite_expires_at = NULL, version = version + 1
    WHERE id = p_couple_id;

  UPDATE public.profiles SET couple_id = NULL, version = version + 1
    WHERE id IN (v_row.user_a, v_row.user_b);

  RETURN jsonb_build_object('ok', true);
END $$;

-- ─────────────────────────────────────────────────────────────
-- 6) 보강 인덱스 — 앱 불변식의 DB 2차 방어선
-- ─────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX uq_couple_active_user_a
  ON public.couples(user_a) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX uq_couple_active_user_b
  ON public.couples(user_b) WHERE status = 'ACTIVE' AND user_b IS NOT NULL;
CREATE UNIQUE INDEX uq_couple_pending_user_a
  ON public.couples(user_a) WHERE status = 'PENDING';

-- ─────────────────────────────────────────────────────────────
-- 7) 권한: RPC는 authenticated만. couples 직접 쓰기는 잠가서 RPC 독점(우회 차단).
-- ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.create_invite()         FROM public, anon;
REVOKE ALL ON FUNCTION public.accept_invite(text)     FROM public, anon;
REVOKE ALL ON FUNCTION public.disconnect_couple(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.gen_invite_code()       FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_invite()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite(text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_couple(uuid) TO authenticated;

-- couples write 잠금: 0004의 직접 insert/update 정책 제거 → 모든 상태전이는 RPC만.
-- (SECURITY DEFINER RPC는 소유자 권한으로 RLS 우회. select 정책은 유지 — 본인 커플 조회 필요.)
DROP POLICY IF EXISTS couples_member_insert ON public.couples;
DROP POLICY IF EXISTS couples_member_update ON public.couples;
