-- 0005 Realtime publication — love_place (web-stack.md §4.3 / 설계서 §5.1)
-- 공유 테이블의 변경을 둘 사이에 자동 전파(supabase_realtime publication에 추가).
-- RLS가 Realtime에도 적용됨 전제 → 타 커플 변경은 수신되지 않는다.
-- 주의: supabase_realtime publication은 Supabase 프로젝트에 기본 존재. 없으면 생성.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.places;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wishes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.visits;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trips;
ALTER PUBLICATION supabase_realtime ADD TABLE public.photos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.itineraries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;
