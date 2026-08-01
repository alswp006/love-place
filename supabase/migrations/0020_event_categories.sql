-- 0020 일정 카테고리(투두메이트식 색+이름 목록) — 둘이 만들어 쓰는 명명 분류.
--
-- 위치: 카테고리는 '도출되는 상태'가 아니라 사용자가 직접 만드는 명명 목록이다(CLAUDE.md §7 위반 아님).
--   events.category_id는 그 목록을 가리키는 선택적 FK — 없으면 '분류 없음'이고, 어떤 동작도 막지 않는다.
--   장소의 places.category(카카오/네이버가 준 문자열)와는 별개 축이다. 섞지 말 것.
--
-- 왜 별도 테이블인가: 색을 함께 저장해야 캘린더 칩에 색을 붙일 수 있고, 이름 오타로 같은 분류가
--   갈라지는 것을 막는다. 자유 텍스트 컬럼이면 '운동'/'운동 '이 다른 분류가 된다.
--   색만으로 구분하지 않는다(§8) — UI는 항상 색 + 이름 텍스트를 함께 낸다.
--
-- 규약(0015 collections와 동형):
--   - couple_id + 감사/동기화 6필드. soft-delete(deleted_at)만. 부분 유니크는 살아있는 행만.
--   - RLS = couple_id = current_couple_id() 격리 + 휴지통(trash) 정책.
--   - GRANT(authenticated + service_role) + supabase_realtime publication.
-- 멱등: CREATE ... IF NOT EXISTS + DROP POLICY IF EXISTS + DO 가드 → 재푸시 무해.
-- 적용: npx supabase db push.

-- ─────────────────────────────────────────────────────────────
-- 1) 테이블
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id  uuid NOT NULL REFERENCES public.couples(id),
  name       text NOT NULL,
  -- 칩 배경/점 색. 토큰이 아니라 값으로 저장한다(사용자가 고른 색이므로 테마와 무관하게 보존).
  color      text NOT NULL DEFAULT '#e2638a',
  -- 목록 정렬. 같은 값이면 name으로 안정 정렬(앱에서 처리).
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_by uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1
);

-- events → 카테고리(선택). ON DELETE는 걸지 않는다 — 카테고리는 soft-delete만 하므로
-- 물리 삭제로 이 FK가 끊길 일이 없고, 삭제된 카테고리를 가리키는 일정은 앱에서 '분류 없음'으로 읽는다.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.event_categories(id);

-- ─────────────────────────────────────────────────────────────
-- 2) 인덱스
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_event_categories_couple
  ON public.event_categories(couple_id) WHERE deleted_at IS NULL;

-- 같은 커플 내 같은 이름 카테고리 1개(살아있는 것 기준) — 중복 생성 멱등.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_categories_couple_name
  ON public.event_categories(couple_id, name) WHERE deleted_at IS NULL;

-- 카테고리별 일정 조회 보조(살아있는 일정만).
CREATE INDEX IF NOT EXISTS idx_events_category
  ON public.events(category_id) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 3) updated_at 트리거(0003과 동형). version은 앱이 명시 증가(낙관적 락 §4.3).
-- ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_touch_event_categories ON public.event_categories;
CREATE TRIGGER trg_touch_event_categories
  BEFORE UPDATE ON public.event_categories FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4) GRANT
-- ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_categories TO authenticated;
GRANT ALL ON public.event_categories TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 5) RLS — couple 격리 + 휴지통(0015와 동형)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_categories_couple ON public.event_categories;
CREATE POLICY event_categories_couple ON public.event_categories
  FOR ALL USING (couple_id = public.current_couple_id() AND deleted_at IS NULL)
          WITH CHECK (couple_id = public.current_couple_id());

DROP POLICY IF EXISTS event_categories_trash_select ON public.event_categories;
DROP POLICY IF EXISTS event_categories_trash_update ON public.event_categories;
CREATE POLICY event_categories_trash_select ON public.event_categories
  FOR SELECT USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL);
CREATE POLICY event_categories_trash_update ON public.event_categories
  FOR UPDATE USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL)
             WITH CHECK (couple_id = public.current_couple_id());

-- ─────────────────────────────────────────────────────────────
-- 6) Realtime publication(0005·0015와 동형) — 한쪽이 만든 카테고리가 상대에게 바로 뜬다.
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'event_categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.event_categories;
  END IF;
END $$;
