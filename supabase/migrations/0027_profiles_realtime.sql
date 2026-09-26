-- 0027 profiles를 Realtime publication에 더한다.
--
-- 왜: Flutter 앱이 couple 채널에 profiles를 묶어 구독했는데 이 표가 publication에 없었다.
--   Realtime은 publication 밖 표가 하나라도 끼면 채널을 SUBSCRIBED라고 답하면서
--   **아무 이벤트도 안 보낸다**(에러 없음). 그래서 상대가 추가한 일정·장소가 앱을 껐다
--   켤 때까지 안 보였다. 앱은 profiles를 채널에서 뺐다(즉시 수정). 이 마이그레이션은
--   상대의 이름·색 변경도 실시간으로 따라오게 하는 후속이다.
--
-- RLS: profiles는 이미 RLS가 켜져 있고 Realtime은 구독자의 JWT로 정책을 평가한다 —
--   커플 밖 프로필 변경은 전달되지 않는다. publication 추가는 노출 범위를 넓히지 않는다.
-- 멱등: 이미 들어 있으면 건너뛴다(0005·0015·0020과 같은 DO 가드). 적용: npx supabase db push.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;
