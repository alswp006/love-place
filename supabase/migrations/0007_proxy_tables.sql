-- 0007 프록시 인프라 테이블 — love_place (03-proxy-contract.md §0.4·§0.5·§0.6)
-- Edge Function 프록시가 레이트리밋·사용량·캐시에 쓰는 테이블. service_role만 접근(클라이언트 직접 접근 없음).

-- 호출 로그 (레이트리밋 슬라이딩 윈도우 + 월 사용량 집계)
CREATE TABLE public.proxy_call_log (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  couple_id uuid NOT NULL,
  fn        text NOT NULL,                          -- 'kakao-search' 등
  called_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_proxy_call_log_window ON public.proxy_call_log(couple_id, fn, called_at);

-- 결과 캐시 (외부 호출·과금 절감)
CREATE TABLE public.proxy_cache (
  cache_key  text PRIMARY KEY,                      -- fn + ':' + sha256(정규화 입력)
  fn         text NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX idx_proxy_cache_expires ON public.proxy_cache(expires_at);

-- RLS 켜되 정책 없음 = 일반 사용자(anon/authenticated) 접근 0.
-- service_role은 RLS를 우회하므로 Edge Function만 읽고 쓸 수 있다(클라이언트 격리).
ALTER TABLE public.proxy_call_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proxy_cache    ENABLE ROW LEVEL SECURITY;

-- 오래된 로그/만료 캐시 정리용 함수(선택 — pg_cron으로 주기 호출 가능).
CREATE OR REPLACE FUNCTION public.cleanup_proxy_tables()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.proxy_call_log WHERE called_at < now() - interval '2 days';
  DELETE FROM public.proxy_cache    WHERE expires_at < now() - interval '1 hour';
$$;
