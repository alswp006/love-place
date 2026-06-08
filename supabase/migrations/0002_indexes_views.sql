-- 0002 인덱스 + 뷰 — love_place (.ai-factory/02-data-model.md §3·§2)
-- couple_id 격리 인덱스(RLS·조회 핵심), 부분 유니크(soft-delete 고려), 조회 보조, v_place_status 뷰.

-- ── couple_id: 전 공유 테이블 (살아있는 행만)
CREATE INDEX idx_places_couple      ON public.places(couple_id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_wishes_couple      ON public.wishes(couple_id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_visits_couple      ON public.visits(couple_id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_trips_couple       ON public.trips(couple_id)       WHERE deleted_at IS NULL;
CREATE INDEX idx_photos_couple      ON public.photos(couple_id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_events_couple      ON public.events(couple_id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_itineraries_couple ON public.itineraries(couple_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_reactions_couple   ON public.reactions(couple_id)   WHERE deleted_at IS NULL;

-- ── 부분 유니크 제약(§5.2 중복 점프 등)
-- 같은 커플 내 같은 카카오 장소는 1개(살아있는 것 기준)
CREATE UNIQUE INDEX uq_places_couple_kakao
  ON public.places(couple_id, kakao_place_id)
  WHERE kakao_place_id IS NOT NULL AND deleted_at IS NULL;

-- 활성 PENDING 초대코드 유일
CREATE UNIQUE INDEX uq_couples_invite_code
  ON public.couples(invite_code)
  WHERE invite_code IS NOT NULL AND status = 'PENDING';

-- 한 사람 한 장소 1위시
CREATE UNIQUE INDEX uq_wishes_place_user
  ON public.wishes(place_id, user_id) WHERE deleted_at IS NULL;

-- 같은 리액션 중복 방지
CREATE UNIQUE INDEX uq_reactions_unique
  ON public.reactions(user_id, target_type, target_id, emoji) WHERE deleted_at IS NULL;

-- ── 조회 보조
CREATE INDEX idx_wishes_place     ON public.wishes(place_id)         WHERE deleted_at IS NULL;
CREATE INDEX idx_visits_place     ON public.visits(place_id)         WHERE deleted_at IS NULL;
CREATE INDEX idx_visits_trip      ON public.visits(trip_id)          WHERE deleted_at IS NULL;
CREATE INDEX idx_photos_trip      ON public.photos(trip_id)          WHERE deleted_at IS NULL;
CREATE INDEX idx_photos_place     ON public.photos(place_id)         WHERE deleted_at IS NULL;
CREATE INDEX idx_events_owner     ON public.events(owner_id)         WHERE deleted_at IS NULL;
CREATE INDEX idx_events_range     ON public.events(couple_id, start) WHERE deleted_at IS NULL;
CREATE INDEX idx_places_region    ON public.places(region_code)      WHERE deleted_at IS NULL;
CREATE INDEX idx_reactions_target ON public.reactions(target_type, target_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_profiles_couple  ON public.profiles(couple_id);
CREATE INDEX idx_regions_parent   ON public.regions(parent_code);

-- ── 장소별 상태 뷰(§2) — "가고싶은/가본"은 도출값. 마커·필터용.
-- security_invoker=on: 뷰가 호출자 권한으로 동작 → 하위 테이블 RLS가 그대로 적용(타 커플 누출 방지).
CREATE VIEW public.v_place_status
WITH (security_invoker = on) AS
SELECT
  p.id        AS place_id,
  p.couple_id,
  EXISTS (SELECT 1 FROM public.wishes w
            WHERE w.place_id = p.id AND w.deleted_at IS NULL)   AS is_wished,
  EXISTS (SELECT 1 FROM public.visits v
            WHERE v.place_id = p.id AND v.deleted_at IS NULL)   AS is_visited,
  ARRAY(  SELECT w.user_id FROM public.wishes w
            WHERE w.place_id = p.id AND w.deleted_at IS NULL)   AS wished_by
FROM public.places p
WHERE p.deleted_at IS NULL;
