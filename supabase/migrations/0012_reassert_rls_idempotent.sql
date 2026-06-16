-- 0012 RLS 정책 멱등 재적용 — 삭제/가봤음취소/리액션 "안 됨" 복구
--
-- 문제(런타임 확인 2026-06): 장소 삭제·가봤음 취소·리액션 토글이 동작하지 않음.
--   원인 추정: 초기 remote DB가 0009(reactions 소유자 정책)·0010(휴지통 trash 정책) SQL이
--   실제로 실행되지 않은 스냅샷에서 만들어졌는데, 0011 푸시 과정의 migration repair가
--   0001~0010을 "applied"로 기록(이력만)해 그 누락을 가렸을 수 있다.
--   → trash select 정책이 없으면 softDelete의 .update(...).select()가 삭제된 행(deleted_at IS NOT NULL)을
--     못 돌려받아 0행 = 거짓 충돌로 처리됨(삭제는 됐는데 실패로 보이거나, 휴지통/복구가 빈다).
--   → reactions 소유자 정책이 없으면 0004의 reactions_couple(FOR ALL)만 있거나, 아예 정책 부재일 수 있다.
--
-- 수정: 0009 + 0010의 정책을 DROP POLICY IF EXISTS + CREATE로 **멱등 재적용**한다.
--   이미 올바르게 존재하면 동일하게 재생성(무해), 누락됐으면 이제 생성되어 기능 복구.
-- 적용: supabase db push (CLI). 함수 재배포 불필요(RLS는 DB 레벨, 즉시 반영).
-- 안전성: 정책 정의는 0009/0010과 1:1 동일. 데이터/스키마 변경 없음(정책만).

-- ─────────────────────────────────────────────────────────────
-- reactions (0009) — 읽기=커플 전체 / 쓰기=본인(user_id = auth.uid())만
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS reactions_couple ON public.reactions;
DROP POLICY IF EXISTS reactions_select ON public.reactions;
DROP POLICY IF EXISTS reactions_insert ON public.reactions;
DROP POLICY IF EXISTS reactions_update ON public.reactions;
DROP POLICY IF EXISTS reactions_delete ON public.reactions;

CREATE POLICY reactions_select ON public.reactions
  FOR SELECT
  USING (couple_id = public.current_couple_id() AND deleted_at IS NULL);

CREATE POLICY reactions_insert ON public.reactions
  FOR INSERT
  WITH CHECK (couple_id = public.current_couple_id() AND user_id = auth.uid());

CREATE POLICY reactions_update ON public.reactions
  FOR UPDATE
  USING (couple_id = public.current_couple_id() AND user_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (couple_id = public.current_couple_id() AND user_id = auth.uid());

CREATE POLICY reactions_delete ON public.reactions
  FOR DELETE
  USING (couple_id = public.current_couple_id() AND user_id = auth.uid() AND deleted_at IS NULL);

-- ─────────────────────────────────────────────────────────────
-- 휴지통 trash 정책 (0010) — 삭제된 행(deleted_at IS NOT NULL) SELECT(조회)·UPDATE(복구/soft-delete RETURNING)
--   가산 정책(permissive OR) — 기존 "살아있는 행" 정책과 합쳐짐.
-- ─────────────────────────────────────────────────────────────

-- places
DROP POLICY IF EXISTS places_trash_select ON public.places;
DROP POLICY IF EXISTS places_trash_update ON public.places;
CREATE POLICY places_trash_select ON public.places
  FOR SELECT USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL);
CREATE POLICY places_trash_update ON public.places
  FOR UPDATE USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL)
             WITH CHECK (couple_id = public.current_couple_id());

-- trips
DROP POLICY IF EXISTS trips_trash_select ON public.trips;
DROP POLICY IF EXISTS trips_trash_update ON public.trips;
CREATE POLICY trips_trash_select ON public.trips
  FOR SELECT USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL);
CREATE POLICY trips_trash_update ON public.trips
  FOR UPDATE USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL)
             WITH CHECK (couple_id = public.current_couple_id());

-- visits
DROP POLICY IF EXISTS visits_trash_select ON public.visits;
DROP POLICY IF EXISTS visits_trash_update ON public.visits;
CREATE POLICY visits_trash_select ON public.visits
  FOR SELECT USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL);
CREATE POLICY visits_trash_update ON public.visits
  FOR UPDATE USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL)
             WITH CHECK (couple_id = public.current_couple_id());

-- photos
DROP POLICY IF EXISTS photos_trash_select ON public.photos;
DROP POLICY IF EXISTS photos_trash_update ON public.photos;
CREATE POLICY photos_trash_select ON public.photos
  FOR SELECT USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL);
CREATE POLICY photos_trash_update ON public.photos
  FOR UPDATE USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL)
             WITH CHECK (couple_id = public.current_couple_id());

-- itineraries
DROP POLICY IF EXISTS itineraries_trash_select ON public.itineraries;
DROP POLICY IF EXISTS itineraries_trash_update ON public.itineraries;
CREATE POLICY itineraries_trash_select ON public.itineraries
  FOR SELECT USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL);
CREATE POLICY itineraries_trash_update ON public.itineraries
  FOR UPDATE USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL)
             WITH CHECK (couple_id = public.current_couple_id());

-- events — visibility 다단계 보존(복구도 SHARED 또는 소유자만, §4.2)
DROP POLICY IF EXISTS events_trash_select ON public.events;
DROP POLICY IF EXISTS events_trash_update ON public.events;
CREATE POLICY events_trash_select ON public.events
  FOR SELECT USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL);
CREATE POLICY events_trash_update ON public.events
  FOR UPDATE
  USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL
         AND (visibility = 'SHARED' OR owner_id = auth.uid()))
  WITH CHECK (couple_id = public.current_couple_id());
