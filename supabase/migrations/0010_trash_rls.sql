-- 0010 휴지통 RLS (D3) — security-privacy.md §4 / 설계서 §4.3
--
-- 문제(감사 확인): 0004의 표준 정책은 USING(... deleted_at IS NULL)이라 삭제된 행을
--   조회/수정할 수 없다 → 휴지통 화면·복구 경로가 막힘("삭제하면 복구 불가").
--
-- 수정(가산 정책 — PostgreSQL의 permissive 정책은 OR로 합쳐짐):
--   삭제된 행(deleted_at IS NOT NULL)에 한해 내 커플이 SELECT(휴지통 조회)·UPDATE(복구)하도록 추가.
--   기존 "살아있는 행" 정책과 OR → 일반 쿼리는 앱이 deleted_at IS NULL로 거르고, 휴지통은 IS NOT NULL로 본다.
-- 적용: Supabase SQL Editor/CLI. 복구는 이 마이그레이션 적용 후에만 라이브 동작.
-- (wishes는 사용자 삭제 UI 없음 → 생략. reactions는 0009에서 소유자 범위로 처리.)

-- ── places
CREATE POLICY places_trash_select ON public.places
  FOR SELECT USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL);
CREATE POLICY places_trash_update ON public.places
  FOR UPDATE USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL)
             WITH CHECK (couple_id = public.current_couple_id());

-- ── trips
CREATE POLICY trips_trash_select ON public.trips
  FOR SELECT USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL);
CREATE POLICY trips_trash_update ON public.trips
  FOR UPDATE USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL)
             WITH CHECK (couple_id = public.current_couple_id());

-- ── visits
CREATE POLICY visits_trash_select ON public.visits
  FOR SELECT USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL);
CREATE POLICY visits_trash_update ON public.visits
  FOR UPDATE USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL)
             WITH CHECK (couple_id = public.current_couple_id());

-- ── photos
CREATE POLICY photos_trash_select ON public.photos
  FOR SELECT USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL);
CREATE POLICY photos_trash_update ON public.photos
  FOR UPDATE USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL)
             WITH CHECK (couple_id = public.current_couple_id());

-- ── itineraries
CREATE POLICY itineraries_trash_select ON public.itineraries
  FOR SELECT USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL);
CREATE POLICY itineraries_trash_update ON public.itineraries
  FOR UPDATE USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL)
             WITH CHECK (couple_id = public.current_couple_id());

-- ── events — visibility 다단계 보존(복구도 SHARED 또는 소유자만, §4.2)
CREATE POLICY events_trash_select ON public.events
  FOR SELECT USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL);
CREATE POLICY events_trash_update ON public.events
  FOR UPDATE
  USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL
         AND (visibility = 'SHARED' OR owner_id = auth.uid()))
  WITH CHECK (couple_id = public.current_couple_id());
