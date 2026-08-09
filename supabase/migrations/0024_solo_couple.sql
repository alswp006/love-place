-- 0024 혼자서도 쓸 수 있게 — '솔로 커플'(user_b IS NULL, status = 'ACTIVE')
--
-- 무엇이 문제였나: 로그인 직후엔 ACTIVE 커플이 없고, current_couple_id()는 ACTIVE만 인정한다(0008).
-- 그래서 연결 전에는 RLS가 **모든 것을 막았고**, 앱은 연결 화면 말고는 보여줄 게 없었다.
-- 그런데 현실은 한 사람이 먼저 쓰기 시작하는 경우가 흔하다.
--
-- 어떻게 여는가: 로그인하면 **혼자짜리 ACTIVE 커플**을 하나 만든다(user_b = NULL).
--   ⇒ current_couple_id()가 그대로 값을 돌려주므로 **RLS 정책·테이블은 한 줄도 안 고친다.**
--   ⇒ 나중에 상대가 코드를 넣으면 그 행의 user_b만 채워진다.
--      couple_id가 안 바뀌므로 **혼자 쌓아둔 장소·일정·사진이 그대로 둘의 것이 된다.**
--      (별도 PENDING 행을 만들어 갈아타는 옛 방식이었다면 데이터 이관이 필요했다.)
--
-- 그래서 PENDING은 더 이상 새로 만들지 않는다. 초대 = '내 커플의 빈자리에 코드를 붙이는 것'이고,
-- 수락 = '빈자리가 있는 커플에 들어가는 것'이다. 옛 PENDING 행도 계속 수락된다(호환).
--
-- 멱등: CREATE OR REPLACE + IF NOT EXISTS + 조건부 INSERT → 재푸시 무해.

-- ─────────────────────────────────────────────────────────────
-- 1) 초대 코드 유니크 범위 확장
--    0002의 인덱스는 `WHERE ... status = 'PENDING'`이라, 코드가 ACTIVE 행에 붙는 순간
--    유니크가 **적용되지 않는다**. create_invite의 unique_violation 재시도도 죽은 코드가 된다.
-- ─────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.uq_couples_invite_code;
CREATE UNIQUE INDEX IF NOT EXISTS uq_couples_invite_code
  ON public.couples(invite_code)
  WHERE invite_code IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2) 커플에 내용물이 있나 — 수락 시 '빈 솔로 커플'만 조용히 접기 위한 판정.
--    데이터가 있는 두 사람을 합치는 건 병합 문제라 이 함수가 true면 앱이 거절하고 설명한다
--    (조용히 한쪽을 잃는 것보다 낫다).
--    soft-deleted 행도 내용으로 친다 — 휴지통에 있는 것도 그 사람의 데이터다(§4.3).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.couple_has_content(p_couple uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.places      WHERE couple_id = p_couple)
      OR EXISTS (SELECT 1 FROM public.events      WHERE couple_id = p_couple)
      OR EXISTS (SELECT 1 FROM public.trips       WHERE couple_id = p_couple)
      OR EXISTS (SELECT 1 FROM public.photos      WHERE couple_id = p_couple)
      OR EXISTS (SELECT 1 FROM public.wishes      WHERE couple_id = p_couple)
      OR EXISTS (SELECT 1 FROM public.visits      WHERE couple_id = p_couple)
      OR EXISTS (SELECT 1 FROM public.collections WHERE couple_id = p_couple)
$$;

-- ─────────────────────────────────────────────────────────────
-- 3) ensure_solo_couple() — 내 ACTIVE 커플을 보장한다. 멱등.
--    이미 ACTIVE(솔로든 둘이든)면 그 id를 그대로 준다.
--    PENDING만 있으면 그 행을 ACTIVE로 **승격**한다 — 코드는 살려둔다(상대가 아직 수락 가능).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_solo_couple()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'AUTH_REQUIRED'); END IF;

  INSERT INTO public.profiles (id, display_name) VALUES (v_uid, '') ON CONFLICT (id) DO NOTHING;

  SELECT id INTO v_id FROM public.couples
    WHERE (user_a = v_uid OR user_b = v_uid) AND status = 'ACTIVE' LIMIT 1;

  IF v_id IS NULL THEN
    -- 옛 PENDING 행이 있으면 새로 만들지 않고 승격한다. 새 행을 만들면 코드가 두 갈래로 갈려
    -- 상대가 받은 코드가 '내 데이터가 없는 쪽'으로 연결된다.
    UPDATE public.couples SET status = 'ACTIVE', version = version + 1
      WHERE user_a = v_uid AND status = 'PENDING'
      RETURNING id INTO v_id;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.couples (user_a, status) VALUES (v_uid, 'ACTIVE') RETURNING id INTO v_id;
  END IF;

  UPDATE public.profiles SET couple_id = v_id, version = version + 1
    WHERE id = v_uid AND couple_id IS DISTINCT FROM v_id;

  RETURN jsonb_build_object('ok', true, 'couple_id', v_id);
END $$;

-- ─────────────────────────────────────────────────────────────
-- 4) 가입 트리거 — 프로필과 함께 솔로 커플까지.
--    ⚠️ 여기선 auth.uid()를 쓸 수 없다(트리거 실행 맥락은 그 사용자가 아니다). NEW.id를 쓴다.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(split_part(NEW.email, '@', 1), ''))
  ON CONFLICT (id) DO NOTHING;

  -- 혼자서도 바로 쓸 수 있게 ACTIVE 커플을 깔아둔다(0024). 이미 있으면 손대지 않는다.
  SELECT id INTO v_id FROM public.couples
    WHERE (user_a = NEW.id OR user_b = NEW.id) AND status = 'ACTIVE' LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.couples (user_a, status) VALUES (NEW.id, 'ACTIVE') RETURNING id INTO v_id;
  END IF;
  UPDATE public.profiles SET couple_id = v_id WHERE id = NEW.id AND couple_id IS NULL;

  RETURN NEW;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 5) 백필 — 이미 가입한 사람들. 트리거는 신규 가입에만 걸린다.
-- ─────────────────────────────────────────────────────────────
-- 5a) PENDING만 있는 사람 → 승격(코드 유지)
UPDATE public.couples c
   SET status = 'ACTIVE', version = version + 1
 WHERE c.status = 'PENDING'
   AND NOT EXISTS (
     SELECT 1 FROM public.couples x
      WHERE x.status = 'ACTIVE' AND (x.user_a = c.user_a OR x.user_b = c.user_a)
   );

-- 5b) 아무 커플도 없는 사람 → 솔로 커플 생성
INSERT INTO public.couples (user_a, status)
SELECT p.id, 'ACTIVE' FROM public.profiles p
 WHERE NOT EXISTS (
   SELECT 1 FROM public.couples c
    WHERE (c.user_a = p.id OR c.user_b = p.id) AND c.status = 'ACTIVE'
 );

-- 5c) profiles.couple_id 캐시 동기화(정본은 couples, §4.2)
UPDATE public.profiles p
   SET couple_id = c.id, version = p.version + 1
  FROM public.couples c
 WHERE (c.user_a = p.id OR c.user_b = p.id)
   AND c.status = 'ACTIVE'
   AND p.couple_id IS DISTINCT FROM c.id;

-- ─────────────────────────────────────────────────────────────
-- 6) create_invite() — 내 커플의 **빈자리**에 코드를 붙인다(새 행을 만들지 않는다).
--    이게 데이터 승계의 핵심이다: 코드가 내 기존 couple_id에 붙어야
--    상대가 들어왔을 때 내가 혼자 쌓은 것이 그대로 둘의 것이 된다.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_invite()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.couples%ROWTYPE;
  v_id uuid; v_code text; v_exp timestamptz; v_tries int := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'AUTH_REQUIRED'); END IF;

  INSERT INTO public.profiles (id, display_name) VALUES (v_uid, '') ON CONFLICT (id) DO NOTHING;

  -- 이미 **상대가 있는** 커플이면 거부. 혼자(user_b IS NULL)면 초대할 수 있다.
  SELECT * INTO v_row FROM public.couples
    WHERE (user_a = v_uid OR user_b = v_uid) AND status = 'ACTIVE' FOR UPDATE;
  IF FOUND AND v_row.user_b IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ALREADY_COUPLED');
  END IF;

  IF FOUND THEN
    v_id := v_row.id;
    -- 살아있는 코드가 있으면 그대로 준다(코드 난립 방지).
    IF v_row.invite_code IS NOT NULL AND v_row.invite_expires_at > now() THEN
      RETURN jsonb_build_object('ok', true, 'code', v_row.invite_code, 'expires_at', v_row.invite_expires_at);
    END IF;
  ELSE
    -- ACTIVE가 없다면(백필 전 계정 등) 옛 PENDING을 승격하거나 새로 만든다.
    UPDATE public.couples SET status = 'ACTIVE', version = version + 1
      WHERE user_a = v_uid AND status = 'PENDING' RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      INSERT INTO public.couples (user_a, status) VALUES (v_uid, 'ACTIVE') RETURNING id INTO v_id;
    END IF;
    UPDATE public.profiles SET couple_id = v_id, version = version + 1
      WHERE id = v_uid AND couple_id IS DISTINCT FROM v_id;
  END IF;

  LOOP
    v_tries := v_tries + 1;
    v_code := public.gen_invite_code();
    v_exp := now() + interval '48 hours';
    BEGIN
      UPDATE public.couples
         SET invite_code = v_code, invite_expires_at = v_exp, version = version + 1
       WHERE id = v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_tries >= 5 THEN RETURN jsonb_build_object('ok', false, 'reason', 'CODE_COLLISION'); END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'code', v_code, 'expires_at', v_exp);
END $$;

-- ─────────────────────────────────────────────────────────────
-- 7) accept_invite(p_code) — '빈자리가 있는 커플'에 들어간다.
--    매칭 조건이 status='PENDING'에서 **user_b IS NULL**로 바뀐다(솔로 ACTIVE도 받아들이려고).
--    옛 PENDING 행도 user_b가 NULL이므로 그대로 수락된다.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_invite(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_norm text; v_row public.couples%ROWTYPE; v_mine public.couples%ROWTYPE; v_aff int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'AUTH_REQUIRED'); END IF;

  v_norm := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  IF length(v_norm) = 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'INVALID_CODE'); END IF;

  INSERT INTO public.profiles (id, display_name) VALUES (v_uid, '') ON CONFLICT (id) DO NOTHING;

  -- 내 쪽 상태. 이미 상대가 있으면 거부.
  SELECT * INTO v_mine FROM public.couples
    WHERE (user_a = v_uid OR user_b = v_uid) AND status = 'ACTIVE' FOR UPDATE;
  IF FOUND AND v_mine.user_b IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ALREADY_COUPLED');
  END IF;

  -- 내 솔로 커플에 이미 내용이 있으면 합칠 수 없다 — 조용히 한쪽을 버리지 않고 그렇게 말한다.
  IF FOUND AND public.couple_has_content(v_mine.id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'HAS_OWN_DATA');
  END IF;

  -- 빈자리 + 코드 일치 행 잠금. status는 안 본다(솔로 ACTIVE·옛 PENDING 모두 허용).
  SELECT * INTO v_row FROM public.couples
    WHERE invite_code = v_norm AND user_b IS NULL AND status <> 'DISCONNECTED' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'INVALID_CODE'); END IF;

  IF v_row.invite_expires_at IS NULL OR v_row.invite_expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'EXPIRED');
  END IF;

  IF v_row.user_a = v_uid THEN RETURN jsonb_build_object('ok', false, 'reason', 'SELF_INVITE'); END IF;

  -- 내 빈 솔로 커플은 접는다. 안 접으면 ACTIVE가 둘이 되어 current_couple_id()의
  -- LIMIT 1이 어느 쪽을 고를지 알 수 없다(= 데이터가 오락가락한다).
  IF v_mine.id IS NOT NULL AND v_mine.id <> v_row.id THEN
    UPDATE public.couples SET status = 'DISCONNECTED', invite_code = NULL,
                              invite_expires_at = NULL, version = version + 1
      WHERE id = v_mine.id;
  END IF;

  UPDATE public.couples
    SET user_b = v_uid, status = 'ACTIVE', connected_at = now(),
        invite_code = NULL, invite_expires_at = NULL, version = version + 1
    WHERE id = v_row.id AND user_b IS NULL;
  GET DIAGNOSTICS v_aff = ROW_COUNT;
  IF v_aff = 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'INVALID_CODE'); END IF;

  UPDATE public.profiles SET couple_id = v_row.id, version = version + 1
    WHERE id IN (v_row.user_a, v_uid);

  RETURN jsonb_build_object('ok', true, 'couple_id', v_row.id, 'status', 'ACTIVE');
END $$;

-- ─────────────────────────────────────────────────────────────
-- 8) disconnect_couple() — 해제 후 **양쪽 다 새 솔로 커플**을 받는다.
--    안 그러면 해제한 순간 둘 다 앱을 못 쓴다(ACTIVE가 없어 RLS가 전부 막는다).
--    공유 데이터는 옛 커플에 그대로 남는다 — 내보내기(§10.4)가 회수 경로다.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.disconnect_couple(p_couple_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.couples%ROWTYPE;
  v_new uuid;
  v_member uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'AUTH_REQUIRED'); END IF;

  SELECT * INTO v_row FROM public.couples
    WHERE id = p_couple_id AND (user_a = v_uid OR user_b = v_uid) AND status = 'ACTIVE'
    FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'NOT_MEMBER_OR_NOT_ACTIVE'); END IF;

  UPDATE public.couples
    SET status = 'DISCONNECTED', invite_code = NULL, invite_expires_at = NULL, version = version + 1
    WHERE id = p_couple_id;

  -- 각자 새 솔로 커플로 시작한다(빈 상태). NULL 멤버는 건너뛴다(솔로 커플 해제 케이스).
  FOREACH v_member IN ARRAY ARRAY[v_row.user_a, v_row.user_b] LOOP
    CONTINUE WHEN v_member IS NULL;
    INSERT INTO public.couples (user_a, status) VALUES (v_member, 'ACTIVE') RETURNING id INTO v_new;
    UPDATE public.profiles SET couple_id = v_new, version = version + 1 WHERE id = v_member;
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END $$;

-- ─────────────────────────────────────────────────────────────
-- 9) 권한
-- ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.ensure_solo_couple() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_solo_couple() TO authenticated;

-- couple_has_content은 **앱에 열지 않는다.** SECURITY DEFINER라 RLS를 지나치므로, 직접 부를 수
-- 있으면 "남의 couple_id에 데이터가 있나"를 참/거짓으로 캐낼 수 있다(작지만 진짜 누수).
-- accept_invite가 definer 권한으로 호출하므로 GRANT 없이도 동작한다.
REVOKE ALL ON FUNCTION public.couple_has_content(uuid) FROM PUBLIC;
