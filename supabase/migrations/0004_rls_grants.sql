-- 0004 RLS 정책 + GRANT — love_place (.ai-factory/02-data-model.md §4 / security-privacy.md §2)
--
-- 중요(이 프로젝트 Supabase 설정 = "Automatically expose new tables OFF"):
--   RLS를 켜도 그것만으로는 PostgREST(supabase-js) 접근이 안 된다.
--   접근에는 두 겹이 필요: ① GRANT(롤이 테이블에 접근 가능한가) + ② RLS POLICY(어떤 행을 볼 수 있는가).
--   GRANT가 없으면 42501 permission denied. 그래서 authenticated 롤에 명시적 GRANT를 준다.
--   anon(비로그인)에는 주지 않는다 — 로그인(authenticated)해야만 데이터 접근.
--   "Automatic RLS ON"이라 새 테이블은 RLS가 자동 ENABLE될 수 있으나, 명시적 ENABLE은 중복 무해 → 직접 켠다.

-- ─────────────────────────────────────────────────────────────
-- 0) 호출자의 정본 couple_id (couples.user_a/user_b 기준, §4.2)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_couple_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id FROM public.couples c
  WHERE (c.user_a = auth.uid() OR c.user_b = auth.uid())
    AND c.status <> 'DISCONNECTED'
  LIMIT 1
$$;

-- ─────────────────────────────────────────────────────────────
-- 1) 스키마/시퀀스 사용 권한 + 테이블 GRANT (authenticated 롤)
-- ─────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO authenticated, anon;

-- 공유 테이블: 로그인 사용자만 읽고 쓴다(행 제한은 아래 RLS가 담당).
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.couples, public.profiles, public.places, public.trips,
  public.wishes, public.visits, public.photos, public.itineraries,
  public.events, public.reactions
TO authenticated;

-- regions는 글로벌 마스터 — 로그인/비로그인 모두 읽기 허용(쓰기는 마이그레이션/service_role만).
GRANT SELECT ON public.regions TO authenticated, anon;

-- 도출 뷰
GRANT SELECT ON public.v_place_status TO authenticated;

-- 헬퍼 함수 실행 권한
GRANT EXECUTE ON FUNCTION public.current_couple_id() TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2) RLS ENABLE (전 공유 테이블)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.couples     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.places      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regions     ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 3) 표준 couple_id 격리 정책 (places·trips·wishes·visits·photos·itineraries·reactions)
--    내 커플의 살아있는 행만 select/insert/update/delete.
-- ─────────────────────────────────────────────────────────────
CREATE POLICY places_couple ON public.places
  FOR ALL USING (couple_id = public.current_couple_id() AND deleted_at IS NULL)
          WITH CHECK (couple_id = public.current_couple_id());

CREATE POLICY trips_couple ON public.trips
  FOR ALL USING (couple_id = public.current_couple_id() AND deleted_at IS NULL)
          WITH CHECK (couple_id = public.current_couple_id());

CREATE POLICY wishes_couple ON public.wishes
  FOR ALL USING (couple_id = public.current_couple_id() AND deleted_at IS NULL)
          WITH CHECK (couple_id = public.current_couple_id());

CREATE POLICY visits_couple ON public.visits
  FOR ALL USING (couple_id = public.current_couple_id() AND deleted_at IS NULL)
          WITH CHECK (couple_id = public.current_couple_id());

CREATE POLICY photos_couple ON public.photos
  FOR ALL USING (couple_id = public.current_couple_id() AND deleted_at IS NULL)
          WITH CHECK (couple_id = public.current_couple_id());

CREATE POLICY itineraries_couple ON public.itineraries
  FOR ALL USING (couple_id = public.current_couple_id() AND deleted_at IS NULL)
          WITH CHECK (couple_id = public.current_couple_id());

CREATE POLICY reactions_couple ON public.reactions
  FOR ALL USING (couple_id = public.current_couple_id() AND deleted_at IS NULL)
          WITH CHECK (couple_id = public.current_couple_id());

-- ─────────────────────────────────────────────────────────────
-- 4) events — visibility 다단계(§4.2·§5.1)
--    둘은 한 캘린더 공유 → PERSONAL도 양쪽이 보되(읽기 전체), 쓰기는 SHARED만 둘 다·PERSONAL은 소유자.
-- ─────────────────────────────────────────────────────────────
CREATE POLICY events_select ON public.events
  FOR SELECT USING (couple_id = public.current_couple_id() AND deleted_at IS NULL);

CREATE POLICY events_insert ON public.events
  FOR INSERT WITH CHECK (couple_id = public.current_couple_id() AND owner_id = auth.uid());

CREATE POLICY events_update ON public.events
  FOR UPDATE
  USING (couple_id = public.current_couple_id()
         AND (visibility = 'SHARED' OR owner_id = auth.uid()))
  WITH CHECK (couple_id = public.current_couple_id());

CREATE POLICY events_delete ON public.events
  FOR DELETE
  USING (couple_id = public.current_couple_id()
         AND (visibility = 'SHARED' OR owner_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- 5) couples — 내가 멤버인 커플만. (연결 전 user_a 본인 포함)
-- ─────────────────────────────────────────────────────────────
CREATE POLICY couples_member_select ON public.couples
  FOR SELECT USING (user_a = auth.uid() OR user_b = auth.uid());

CREATE POLICY couples_member_insert ON public.couples
  FOR INSERT WITH CHECK (user_a = auth.uid());  -- 내가 생성자(user_a)로만 생성

CREATE POLICY couples_member_update ON public.couples
  FOR UPDATE USING (user_a = auth.uid() OR user_b = auth.uid())
             WITH CHECK (user_a = auth.uid() OR user_b = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 6) profiles — 내 프로필 + 같은 커플 상대 프로필 읽기(아바타·색 표시용), 쓰기는 본인만.
-- ─────────────────────────────────────────────────────────────
CREATE POLICY profiles_self_or_partner_select ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR couple_id = public.current_couple_id()
  );

CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- profiles insert는 handle_new_user 트리거(security definer)가 담당하므로 일반 정책 불필요.

-- ─────────────────────────────────────────────────────────────
-- 7) regions — 모두 읽기(글로벌 마스터). 쓰기 정책 없음 = service_role/마이그레이션만.
-- ─────────────────────────────────────────────────────────────
CREATE POLICY regions_read_all ON public.regions
  FOR SELECT USING (true);
