-- 0013 itineraries.course_key — 추천 코스 추가 멱등화(중복 itinerary/이벤트 차단)
--
-- 문제(spec R1.1): RecommendPage가 클릭 즉시 itinerary+이벤트를 쓰고, 같은 클러스터를
--   양쪽이 탭하거나 네트워크 재시도 시 같은 코스가 중복 생성된다(확인/미리보기/dedupe 없음).
-- 수정: 결정론 course_key(coupleId:dayKey:sortedPlaceIds:startMin)를 itineraries에 저장하고,
--   (couple_id, course_key) 부분 유니크 인덱스(살아있는 행 기준)로 DB 레벨에서 중복을 차단한다.
--   addCourse는 onConflict-do-nothing(upsert ignoreDuplicates) 후 활성 itinerary id를 회수한다.
-- 적용: npx supabase db push. 멱등(IF NOT EXISTS) — 재푸시 무해.
-- 안전성: 컬럼/인덱스 추가만. 기존 행은 course_key NULL(부분 인덱스 제외) — 영향 없음.

ALTER TABLE public.itineraries
  ADD COLUMN IF NOT EXISTS course_key text;

-- 0002의 soft-delete 인식 부분 유니크 패턴을 그대로 따른다.
-- 같은 커플 내 같은 course_key는 살아있는 itinerary 1개만.
CREATE UNIQUE INDEX IF NOT EXISTS uq_itineraries_course_key
  ON public.itineraries(couple_id, course_key)
  WHERE course_key IS NOT NULL AND deleted_at IS NULL;
