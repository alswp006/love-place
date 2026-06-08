-- 0003 트리거 — love_place (.ai-factory/02-data-model.md §6 + 보강)
-- (a) updated_at 자동 갱신 (version은 앱이 명시 증가 — 낙관적 락 §4.3)
-- (b) auth.users 가입 시 public.profiles 자동 생성 (매직링크 첫 로그인 후 profiles 없으면 앱 깨짐)

-- ── (a) updated_at 자동 갱신
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- 변경 가능한 공유 테이블 전부에 BEFORE UPDATE 트리거 부착.
CREATE TRIGGER trg_touch_couples      BEFORE UPDATE ON public.couples      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_touch_profiles     BEFORE UPDATE ON public.profiles     FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_touch_places       BEFORE UPDATE ON public.places       FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_touch_trips        BEFORE UPDATE ON public.trips        FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_touch_wishes       BEFORE UPDATE ON public.wishes       FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_touch_visits       BEFORE UPDATE ON public.visits       FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_touch_photos       BEFORE UPDATE ON public.photos       FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_touch_itineraries  BEFORE UPDATE ON public.itineraries  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_touch_events       BEFORE UPDATE ON public.events       FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_touch_reactions    BEFORE UPDATE ON public.reactions    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── (b) 가입 시 profiles 자동 생성
-- 매직링크로 처음 로그인하면 auth.users에 행이 생긴다 → 같은 id로 public.profiles 행을 만든다.
-- security definer + search_path 비움(권장): 호출자 권한과 무관하게 안전하게 insert.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    -- 이메일 앞부분을 기본 표시명으로(나중에 본인이 수정).
    COALESCE(split_part(NEW.email, '@', 1), '')
  )
  ON CONFLICT (id) DO NOTHING;  -- 재실행 안전
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 참고: trips.cover_photo_id의 "사진 삭제 시 null 폴백"은 0001의
-- ON DELETE SET NULL 제약으로 이미 처리됨(별도 트리거 불필요).
