-- 0019 wishes·reactions 휴지통 RLS 보강 — security-privacy.md §2·§4 / 설계서 §4.3
--
-- 사실(정적 확인): 0010은 places/trips/visits/photos/itineraries/events에만 trash 정책을 깔고
--   주석에 "(wishes는 사용자 삭제 UI 없음 → 생략. reactions는 0009에서 소유자 범위로 처리)"라고 적었다.
--   그런데 0009의 reactions_select는 `deleted_at IS NULL`만 본다 → 두 테이블에 휴지통 정책이 **없다**.
--
-- 왜 문제인가:
--   softDelete()는 `.update({deleted_at…}).select()` 즉 UPDATE ... RETURNING이고,
--   restore()는 삭제된 행을 다시 살린다. 두 경로 모두 "deleted_at IS NOT NULL인 행"을
--   보거나 만져야 하는데 기존 정책은 살아있는 행만 허용한다.
--
-- 증상은 단정하지 않는다:
--   워크플로 분석은 이를 "0행 → 거짓 충돌 배너"로 서술했으나, UPDATE ... RETURNING에서
--   RLS가 어떻게 걸리느냐에 따라 무음 실패일 수도 있고 두 경로의 증상이 서로 다를 수도 있다.
--   실 DB 재현 없이 증상을 확정하지 않는다. 다만 **정책 공백 자체는 실재**하고,
--   0010이 다른 테이블에 이미 깐 것과 같은 형태이므로 메우는 것이 옳다.
--
-- 이 프로젝트는 0018(comments)부터 처음부터 휴지통 정책을 함께 깔고 있다.
-- 이 마이그레이션은 그 이전 테이블 두 개를 같은 수준으로 맞추는 소급 적용이다.
--
-- 적용: Supabase SQL Editor 또는 `npx supabase db push`.
-- 검증: src/__tests__/rls.integration.test.ts (⚠️ describe.skipIf — 아래 참조).

-- ── wishes: 커플 격리(0004 표준과 동일 기준). 위시는 '개인 의도'지만 읽기는 커플 전체다.
CREATE POLICY wishes_trash_select ON public.wishes
  FOR SELECT USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL);
CREATE POLICY wishes_trash_update ON public.wishes
  FOR UPDATE USING (couple_id = public.current_couple_id() AND deleted_at IS NOT NULL)
             WITH CHECK (couple_id = public.current_couple_id());

-- ── reactions: 0009 철학 유지 — 쓰기는 본인 것만(상대 리액션을 지우거나 되살릴 수 없다).
CREATE POLICY reactions_trash_select ON public.reactions
  FOR SELECT USING (couple_id = public.current_couple_id() AND user_id = auth.uid() AND deleted_at IS NOT NULL);
CREATE POLICY reactions_trash_update ON public.reactions
  FOR UPDATE USING (couple_id = public.current_couple_id() AND user_id = auth.uid() AND deleted_at IS NOT NULL)
             WITH CHECK (couple_id = public.current_couple_id() AND user_id = auth.uid());
