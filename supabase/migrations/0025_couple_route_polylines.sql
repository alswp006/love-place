-- 0025 커플 전체 동선 폴리라인 일괄 조회 — 전국 지도/여행 지도가 **실측 궤적**을 그리게
--
-- 무엇이 없었나: 좌표를 읽는 길이 get_session_points(세션 하나) 뿐이었다. 그래서 전국 지도는
-- 궤적을 못 쓰고 '방문 장소를 이은 직선'을 그렸다. 그런데 차로 서울→속초를 가면 그건 200km짜리
-- 진짜 궤적이고, 전국 축척에서 제대로 보인다. 러닝 앱이 파는 것도 바로 그 선이다.
-- 세션마다 RPC를 부르면 1년치가 수십 번이라 카드 한 장 그리는 데 쓸 수 없다.
--
-- 이 함수가 지키는 것(get_session_points와 동일 — 완화 아님):
--   ① 내 커플의 세션만.
--   ② 상대 소유 세션은 **상대가 제3자 제공에 동의했을 때만** 포함한다.
--      단, 여기서는 예외를 던지지 않고 **조용히 제외**한다 — 동의 안 한 세션 하나 때문에
--      지도 전체가 실패하면 안 되기 때문이다(부분 표시가 전부 실패보다 정직하다).
--   ③ 포함된 상대 세션마다 PROVIDE 확인자료를 남긴다(제19조, 같은 세션·수신자 1일 1회 디듑).
--
-- 점 수: 세션당 p_max_points로 솎아 반환한다. 전국 지도에서 1초 간격 원본은 의미가 없고
-- (한 화면에 수만 점) 복호 비용만 든다. 첫 점·끝 점은 항상 남긴다(궤적이 잘려 보이지 않게).

CREATE OR REPLACE FUNCTION public.get_couple_route_polylines(p_max_points int DEFAULT 120)
RETURNS TABLE(
  session_id uuid,
  trip_id uuid,
  started_at timestamptz,
  seq int,
  lat double precision,
  lng double precision
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_couple uuid := public.current_couple_id();
  v_caller uuid := auth.uid();
  v_key    text := public._loc_key();
  v_max    int  := GREATEST(2, LEAST(COALESCE(p_max_points, 120), 500));
BEGIN
  IF v_couple IS NULL OR v_caller IS NULL THEN
    RETURN; -- 미연결·미인증은 빈 결과(예외로 지도 전체를 죽이지 않는다)
  END IF;

  -- 볼 수 있는 세션: 내 것 + (상대 것 중 제공 동의된 것)
  CREATE TEMP TABLE _visible ON COMMIT DROP AS
  SELECT s.id, s.trip_id, s.started_at, s.owner_id
  FROM public.trip_sessions s
  WHERE s.couple_id = v_couple
    AND s.deleted_at IS NULL
    AND (
      s.owner_id = v_caller
      OR s.owner_id IS NULL
      OR public._has_consent(s.owner_id, 'THIRD_PARTY_PROVIDE_PARTNER')
    );

  -- 제공사실 확인자료(제19조) — 상대 소유 세션을 실제로 내려주는 것이므로 기록한다.
  INSERT INTO public.location_access_log
    (couple_id, data_subject_id, actor_id, event_type, purpose, recipient_id, session_ref, retain_until, created_by)
  SELECT v_couple, v.owner_id, v_caller, 'PROVIDE', '상대에게 동선 제공(지도 열람)', v_caller, v.id,
         now() + interval '6 months', v_caller
  FROM _visible v
  WHERE v.owner_id IS NOT NULL
    AND v.owner_id <> v_caller
    AND NOT EXISTS (
      SELECT 1 FROM public.location_access_log l
      WHERE l.session_ref = v.id AND l.recipient_id = v_caller
        AND l.event_type = 'PROVIDE' AND l.event_at > now() - interval '1 day'
    );

  RETURN QUERY
  WITH numbered AS (
    SELECT rp.session_id,
           rp.lat_enc,
           rp.lng_enc,
           row_number() OVER (PARTITION BY rp.session_id ORDER BY rp.recorded_at) AS rn,
           count(*)     OVER (PARTITION BY rp.session_id)                          AS total
    FROM public.route_points rp
    JOIN _visible v ON v.id = rp.session_id
    WHERE rp.deleted_at IS NULL
  ),
  kept AS (
    SELECT n.*,
           GREATEST(1, ceil(n.total::numeric / v_max)::int) AS step
    FROM numbered n
  )
  SELECT k.session_id,
         v.trip_id,
         v.started_at,
         k.rn::int,
         pgp_sym_decrypt(k.lat_enc, v_key)::double precision,
         pgp_sym_decrypt(k.lng_enc, v_key)::double precision
  FROM kept k
  JOIN _visible v ON v.id = k.session_id
  -- 첫 점·끝 점은 항상 — 솎다가 궤적의 시작이나 끝이 잘리면 다른 길처럼 보인다.
  WHERE k.rn = 1 OR k.rn = k.total OR (k.rn % k.step) = 0
  ORDER BY v.started_at ASC, k.session_id, k.rn;
END $$;

REVOKE ALL ON FUNCTION public.get_couple_route_polylines(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_couple_route_polylines(int) TO authenticated;
