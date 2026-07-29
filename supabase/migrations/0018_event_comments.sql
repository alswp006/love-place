-- 0018 일정 댓글 (comments) — 설계서 §3 여행/일정 / security-privacy.md §2 / ux-and-accessibility.md §2
--
-- 배경: ux-and-accessibility.md §2는 "무거운 소셜 기능(댓글 스레드·팔로우 등) 금지"를 명시한다.
--   그 조항의 의도는 '피드형 소셜'을 막는 것이고(팔로우·타임라인·알림 유입), 2인이 한 일정에
--   "여기 주차 어려울 듯" 같은 말을 남기는 것은 성격이 다르다고 판단해 **평면 댓글**로만 허용한다.
--   따라서 이 스키마에는 parent_id(대댓글)·mentions·reply_count가 **의도적으로 없다**.
--   스레드가 필요해지면 그건 설계 결정 재검토 사항이지 이 테이블의 확장이 아니다.
--
-- 대상은 events 하나로 못박는다(polymorphic target_type 대신 실제 FK):
--   reactions는 target_type으로 여러 대상을 받지만 그 대가로 FK 무결성이 없다.
--   댓글은 본문이 남는 데이터라 고아 행이 더 아프므로 event_id FK로 정합성을 산다.
--   장소/사진 댓글이 필요해지면 그때 별도 컬럼/테이블을 논의한다(YAGNI).

CREATE TABLE public.comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id  uuid NOT NULL REFERENCES public.couples(id),
  event_id   uuid NOT NULL REFERENCES public.events(id),
  -- 본문: 공백만 금지 + 상한 500자(장문 토론이 아니라 한마디를 남기는 자리).
  body       text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  author_id  uuid NOT NULL REFERENCES public.profiles(id),
  -- 감사/동기화 6필드(CLAUDE.md §3 — 공유 테이블 공통)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_by uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1
);

-- 한 일정의 댓글을 시간순으로 읽는 것이 유일한 조회 패턴.
CREATE INDEX idx_comments_event ON public.comments (event_id, created_at)
  WHERE deleted_at IS NULL;

-- updated_at 자동 갱신(0003과 동일 — version은 앱이 명시 증가, 낙관적 락 §4.3).
CREATE TRIGGER trg_touch_comments BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- ── 정책: 읽기는 커플 전체(상대 댓글도 봐야 대화가 된다), 쓰기는 본인 명의만(0009 reactions와 같은 철학).
CREATE POLICY comments_select ON public.comments
  FOR SELECT
  USING (couple_id = public.current_couple_id() AND deleted_at IS NULL);

CREATE POLICY comments_insert ON public.comments
  FOR INSERT
  WITH CHECK (couple_id = public.current_couple_id() AND author_id = auth.uid());

-- 수정/soft-delete는 작성자만(상대 댓글을 지우거나 위조할 수 없다).
CREATE POLICY comments_update ON public.comments
  FOR UPDATE
  USING (couple_id = public.current_couple_id() AND author_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (couple_id = public.current_couple_id() AND author_id = auth.uid());

CREATE POLICY comments_delete ON public.comments
  FOR DELETE
  USING (couple_id = public.current_couple_id() AND author_id = auth.uid() AND deleted_at IS NULL);

-- ── 휴지통 가산 정책(0010과 동형).
-- 이게 없으면 soft-delete가 `UPDATE ... RETURNING`에서 새 행(deleted_at IS NOT NULL)을 못 돌려주고,
-- versionedUpdate가 0행을 '충돌'로 오해해 되돌리기·삭제가 거짓 충돌로 실패한다(0012 주석의 진단).
-- 처음부터 같이 깐다 — 0009/0010이 reactions·wishes에 이걸 빠뜨려 생긴 문제를 반복하지 않는다.
CREATE POLICY comments_trash_select ON public.comments
  FOR SELECT USING (couple_id = public.current_couple_id() AND author_id = auth.uid() AND deleted_at IS NOT NULL);
CREATE POLICY comments_trash_update ON public.comments
  FOR UPDATE USING (couple_id = public.current_couple_id() AND author_id = auth.uid() AND deleted_at IS NOT NULL)
             WITH CHECK (couple_id = public.current_couple_id() AND author_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;

-- 상대가 남긴 댓글이 바로 보이게(§5.1 공유 자동 전파). RLS가 Realtime에도 적용 → 타 커플 미수신.
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
