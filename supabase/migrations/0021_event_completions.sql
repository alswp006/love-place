-- 0021 일정 완료 기록(체크) — 잔디·여정의 원천.
--
-- 왜 events에 done_at 컬럼이 아니라 별도 테이블인가:
--   반복 일정 때문이다. "매일 운동"은 events 한 행이고 화면의 회차(occurrence)는 그 행에서
--   RRULE로 펼쳐진다. done_at을 events에 두면 오늘 회차를 체크하는 순간 모든 회차가 완료된다.
--   잔디의 주 사용처가 바로 이 반복 습관이므로 회차 단위 기록이 필요하다.
--   → 완료는 '플래그'가 아니라 visits와 같은 결의 **기록**이다(추가되는 행). CLAUDE.md §7과 일관.
--
-- 잔디는 여전히 저장하지 않는다: 이 표를 날짜별로 세면 그게 잔디다(집계 테이블 없음).
--   칸의 주인(내/상대/함께)과 카테고리는 events(owner_id·visibility·category_id)에서 도출한다.
--
-- 체크/해제:
--   체크 = 행 insert, 해제 = soft-delete(deleted_at). 물리 삭제 금지(§4.3) — 되돌리기가 가능하다.
--   같은 회차를 두 번 체크하지 못하게 살아있는 행 기준 부분 유니크를 건다.
--
-- 규약(0020과 동형): couple_id + 감사/동기화 6필드, RLS 격리 + 휴지통 정책, GRANT, realtime.
-- 멱등: CREATE ... IF NOT EXISTS + DROP POLICY IF EXISTS + DO 가드 → 재푸시 무해.
-- 적용: npx supabase db push.

-- ─────────────────────────────────────────────────────────────
-- 1) 테이블
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_completions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id        uuid NOT NULL REFERENCES public.couples(id),
  event_id         uuid NOT NULL REFERENCES public.events(id),
  -- 어느 회차인가. 비반복 일정은 그 일정의 start와 같다. 반복이면 그 회차의 시작 시각.
  -- 이 값이 있어야 "8/5 운동은 했고 8/6은 안 했다"를 구분할 수 있다.
  occurrence_start timestamptz NOT NULL,
  -- 체크한 시각. 잔디는 '완료한 날'로 세므로 이 값의 날짜 버킷을 쓴다.
  done_at          timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL REFERENCES public.profiles(id),
  updated_by       uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at       timestamptz,
  version          integer NOT NULL DEFAULT 1
);

-- ─────────────────────────────────────────────────────────────
-- 2) 인덱스
-- ─────────────────────────────────────────────────────────────
-- 잔디는 "이 커플의 최근 N주 완료"를 훑는다.
CREATE INDEX IF NOT EXISTS idx_event_completions_couple_done
  ON public.event_completions(couple_id, done_at) WHERE deleted_at IS NULL;

-- 목록 렌더가 "이 회차 완료됐나"를 묻는다.
CREATE INDEX IF NOT EXISTS idx_event_completions_event
  ON public.event_completions(event_id, occurrence_start) WHERE deleted_at IS NULL;

-- 같은 회차는 한 번만(살아있는 행 기준) — 더블탭/오프라인 재생이 두 칸을 만들지 않게.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_completions_occurrence
  ON public.event_completions(event_id, occurrence_start) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 3) updated_at 트리거(0003과 동형). version은 앱이 명시 증가(낙관적 락 §4.3).
-- ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_touch_event_completions ON public.event_completions;
CREATE TRIGGER trg_touch_event_completions
  BEFORE UPDATE ON public.event_completions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4) GRANT
-- ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_completions TO authenticated;
GRANT ALL ON public.event_completions TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 5) RLS — couple 격리 + 휴지통(0020과 동형)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.event_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_completions_couple ON public.event_completions;
CREATE POLICY event_completions_couple ON public.event_completions
  FOR ALL USING (couple_id = public.current_couple_id() AND deleted_at IS NULL)
          WITH CHECK (couple_id = public.current_couple_id());

DROP POLICY IF EXISTS event_completions_trash_select ON public.event_completions;
DROP POLICY IF EXISTS event_completions_trash_update ON public.event_completions;
CREATE POLICY event_completions_trash_select ON public.event_completions
  FOR SELECT USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL);
CREATE POLICY event_completions_trash_update ON public.event_completions
  FOR UPDATE USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL)
             WITH CHECK (couple_id = public.current_couple_id());

-- ─────────────────────────────────────────────────────────────
-- 6) Realtime publication — 상대가 체크하면 내 잔디가 바로 자란다.
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'event_completions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.event_completions;
  END IF;
END $$;
