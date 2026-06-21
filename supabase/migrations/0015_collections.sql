-- 0015 사용자 정의 컬렉션(저장 목록) — 네이버지도 "내가 만든 리스트"류, 가산 데이터 레이어.
--
-- 위치: 내장 도출 상태(가고싶음=wishes / 가봤음=visits)는 그대로 도출로 둔다(CLAUDE.md §7).
--   컬렉션은 그것과 별개로 사용자가 직접 만드는 명명 목록 + 장소-목록 다대다 조인이다(상태 플래그 아님).
--
-- 규약(다른 공유 테이블과 동일):
--   - 전 공유 테이블 = couple_id + 감사/동기화 6필드(created_at, updated_at, created_by, updated_by, deleted_at, version).
--   - soft-delete(deleted_at)만(물리삭제 금지 §4.3). 부분 유니크 인덱스는 살아있는 행만(WHERE deleted_at IS NULL).
--   - RLS = couple_id = current_couple_id() 격리(0004 places/wishes와 동형) + 휴지통 trash 정책(0010 형태) → soft-delete/restore.
--   - GRANT(authenticated + service_role) + supabase_realtime publication 추가(0005·0011과 동형).
-- 멱등: CREATE TABLE/INDEX IF NOT EXISTS + DROP POLICY IF EXISTS + DO 가드(publication) → 재푸시 무해.
-- 적용: npx supabase db push.

-- ─────────────────────────────────────────────────────────────
-- 1) 테이블
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.collections (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id  uuid NOT NULL REFERENCES public.couples(id),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_by uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1
);

-- 장소 ↔ 컬렉션 다대다 조인(한 장소가 여러 목록에 들어갈 수 있음).
CREATE TABLE IF NOT EXISTS public.place_collections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id     uuid NOT NULL REFERENCES public.couples(id),
  collection_id uuid NOT NULL REFERENCES public.collections(id),
  place_id      uuid NOT NULL REFERENCES public.places(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL REFERENCES public.profiles(id),
  updated_by    uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at    timestamptz,
  version       integer NOT NULL DEFAULT 1
);

-- ─────────────────────────────────────────────────────────────
-- 2) 인덱스 — couple_id 격리(살아있는 행) + 부분 유니크(soft-delete 고려) + 조회 보조
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_collections_couple
  ON public.collections(couple_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_place_collections_couple
  ON public.place_collections(couple_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_place_collections_place
  ON public.place_collections(place_id) WHERE deleted_at IS NULL;

-- 같은 커플 내 같은 이름 목록 1개(살아있는 것 기준).
CREATE UNIQUE INDEX IF NOT EXISTS uq_collections_couple_name
  ON public.collections(couple_id, name) WHERE deleted_at IS NULL;

-- 한 목록에 같은 장소 1번(살아있는 것 기준) → addPlaceToCollection 재시도/더블탭 멱등.
CREATE UNIQUE INDEX IF NOT EXISTS uq_place_collections_pair
  ON public.place_collections(collection_id, place_id) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 3) updated_at 자동 갱신 트리거(0003과 동형). version은 앱이 명시 증가(낙관적 락 §4.3).
-- ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_touch_collections ON public.collections;
CREATE TRIGGER trg_touch_collections
  BEFORE UPDATE ON public.collections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_place_collections ON public.place_collections;
CREATE TRIGGER trg_touch_place_collections
  BEFORE UPDATE ON public.place_collections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4) GRANT — authenticated(행 제한은 RLS) + service_role(서버 admin·프록시). 0004·0011과 동형.
-- ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections, public.place_collections TO authenticated;
GRANT ALL ON public.collections, public.place_collections TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 5) RLS ENABLE + 정책(0004 places/wishes 격리 + 0010 휴지통 trash 형태, 멱등 DROP/CREATE)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.collections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_collections ENABLE ROW LEVEL SECURITY;

-- ── collections: 살아있는 행 격리(0004 places_couple과 동형)
DROP POLICY IF EXISTS collections_couple ON public.collections;
CREATE POLICY collections_couple ON public.collections
  FOR ALL USING (couple_id = public.current_couple_id() AND deleted_at IS NULL)
          WITH CHECK (couple_id = public.current_couple_id());

-- ── collections: 휴지통(삭제된 행 SELECT 조회 + UPDATE 복구/soft-delete RETURNING) — 0010 형태
DROP POLICY IF EXISTS collections_trash_select ON public.collections;
DROP POLICY IF EXISTS collections_trash_update ON public.collections;
CREATE POLICY collections_trash_select ON public.collections
  FOR SELECT USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL);
CREATE POLICY collections_trash_update ON public.collections
  FOR UPDATE USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL)
             WITH CHECK (couple_id = public.current_couple_id());

-- ── place_collections: 살아있는 행 격리
DROP POLICY IF EXISTS place_collections_couple ON public.place_collections;
CREATE POLICY place_collections_couple ON public.place_collections
  FOR ALL USING (couple_id = public.current_couple_id() AND deleted_at IS NULL)
          WITH CHECK (couple_id = public.current_couple_id());

-- ── place_collections: 휴지통(삭제된 조인행 SELECT + UPDATE 복구/soft-delete RETURNING)
DROP POLICY IF EXISTS place_collections_trash_select ON public.place_collections;
DROP POLICY IF EXISTS place_collections_trash_update ON public.place_collections;
CREATE POLICY place_collections_trash_select ON public.place_collections
  FOR SELECT USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL);
CREATE POLICY place_collections_trash_update ON public.place_collections
  FOR UPDATE USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL)
             WITH CHECK (couple_id = public.current_couple_id());

-- ─────────────────────────────────────────────────────────────
-- 6) Realtime publication 추가(0005와 동형) — 둘 사이 자동 전파. 이미 있으면 무시(멱등).
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'collections'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.collections;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'place_collections'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.place_collections;
  END IF;
END $$;
