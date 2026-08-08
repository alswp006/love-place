-- 0023 완료 기록을 '사람마다 하나'로 — 0021의 유니크 키 정정
--
-- 무엇이 틀렸나: 0021은 `UNIQUE (event_id, occurrence_start)`로 **회차당 1행**만 허용했다.
-- 그런데 이 기능의 규칙은 "하루에 **한 사람이** 별 하나"이고, 별자리 분모도 `날 수 × 2`다.
-- 즉 같은 회차에 두 사람의 완료가 각각 있어야 하는데 스키마가 그걸 막고 있었다.
--
-- 실제 증상: A가 함께 일정을 체크한 뒤 B가 "나도 했다"고 누르면, 앱이 (created_by 필터 없이)
-- 살아있는 행 하나를 찾아 그게 자기 것인 줄 알고 soft-delete 했다 → **A의 별이 사라지고
-- B는 자기 별을 못 얻는다.** 같은 저장소의 선례는 반대로 되어 있다(0002 uq_wishes_place_user).
--
-- 안전성: 새 유니크는 기존 것보다 **약하다**((a,b) 유일 ⇒ (a,b,c) 유일). 따라서 기존 데이터가
-- 새 제약을 위반할 수 없다 — 드롭 후 생성이 실패하지 않는다.
-- 멱등: DROP ... IF EXISTS + CREATE ... IF NOT EXISTS → 재푸시 무해.

DROP INDEX IF EXISTS public.uq_event_completions_occurrence;

-- 같은 회차·같은 사람은 한 번만(살아있는 행 기준). 두 사람은 각자 한 행씩 갖는다.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_completions_occurrence_person
  ON public.event_completions(event_id, occurrence_start, created_by)
  WHERE deleted_at IS NULL;

-- 0021이 만든 idx_event_completions_event는 위 유니크와 컬럼·조건이 사실상 겹쳐
-- 쓰이지 않는다(유니크 인덱스가 조회에도 쓰인다). 중복 인덱스는 쓰기 비용만 늘린다.
DROP INDEX IF EXISTS public.idx_event_completions_event;
