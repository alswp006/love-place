-- 0009 reactions RLS 보안 수정 (D4) — security-privacy.md §2 / ux-and-accessibility.md §2
--
-- 문제(감사 확인): 0004의 reactions_couple = FOR ALL USING/WITH CHECK(couple_id만) 라서
--   user_id = auth.uid() 강제가 없다 → 커플 양측이 "상대가 누른 ❤️ 리액션"을 위조/수정/삭제 가능.
--   리액션은 "누가 눌렀나"(개인 의도)이므로 본인만 쓰기 가능해야 한다(events_insert의 owner_id 패턴과 동일 철학).
--
-- 수정: 읽기는 커플 전체(상대 리액션도 표시해야 함), 쓰기(INSERT/UPDATE/DELETE)는 user_id = auth.uid()만.
-- 적용: Supabase SQL Editor 또는 CLI로 실행. 검증: src/__tests__/rls.integration.test.ts의 D4 케이스(docs/rls-testing.md).

DROP POLICY IF EXISTS reactions_couple ON public.reactions;

-- 읽기 — 내 커플의 살아있는 리액션 전부(상대 것 포함: 누가 ❤️ 눌렀는지 표시).
CREATE POLICY reactions_select ON public.reactions
  FOR SELECT
  USING (couple_id = public.current_couple_id() AND deleted_at IS NULL);

-- 생성 — 내 커플 + 본인 명의만(상대 user_id 위조 차단).
CREATE POLICY reactions_insert ON public.reactions
  FOR INSERT
  WITH CHECK (couple_id = public.current_couple_id() AND user_id = auth.uid());

-- 수정 — 본인 리액션만(soft-delete=deleted_at 채우기도 이 경로). 살아있는 행만.
CREATE POLICY reactions_update ON public.reactions
  FOR UPDATE
  USING (couple_id = public.current_couple_id() AND user_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (couple_id = public.current_couple_id() AND user_id = auth.uid());

-- 물리 삭제 — 본인 리액션만(soft-delete 외 정리 경로).
CREATE POLICY reactions_delete ON public.reactions
  FOR DELETE
  USING (couple_id = public.current_couple_id() AND user_id = auth.uid() AND deleted_at IS NULL);
