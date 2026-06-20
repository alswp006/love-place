-- 0014 위치/사진 상호 동의 저장 + 휴지통 자동정리 함수 — R3 온보딩③ / security-privacy §3.2 §4
--
-- 동의(§3.2): "동의 여부 + 시각"을 감사용으로 기록해야 한다(현재 어디에도 없음).
--   Option A — profiles 자가소유 컬럼(타임스탬프 존재=동의). profiles_self_update로 본인만 기록,
--   profiles_self_or_partner_select로 상대가 "동의했음"을 볼 수 있음(상호 UI에 바람직). 새 정책 불필요.
-- 자동정리(§4): 물리삭제는 복구 유예 경과 후에만. purge_trashed()는 관계종료/법적삭제·예약작업용 메커니즘.
--   (R3는 클라이언트가 deleted_at+30d "삭제 예정일"을 표시; 함수는 실제 물리삭제 수단으로 준비.)
-- 적용: npx supabase db push. 멱등(ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE) — 재푸시 무해.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS photo_consent_at    timestamptz;

-- 휴지통 물리삭제(유예 N일 경과). SECURITY DEFINER — 예약작업/관계종료 정리에서 호출.
-- couple 격리는 호출 컨텍스트가 아니라 전수 정리이므로 service_role 전용으로 잠근다.
CREATE OR REPLACE FUNCTION public.purge_trashed(p_grace_days int DEFAULT 30)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total int := 0; v_n int; t text;
  tables constant text[] := ARRAY['places','trips','visits','photos','itineraries','events'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'DELETE FROM public.%I WHERE deleted_at IS NOT NULL AND deleted_at < now() - ($1 || '' days'')::interval',
      t
    ) USING p_grace_days;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END LOOP;
  RETURN v_total;
END $$;

REVOKE ALL ON FUNCTION public.purge_trashed(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_trashed(int) TO service_role;
