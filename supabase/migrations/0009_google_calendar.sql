-- 0009 구글 캘린더 연동 — love_place (일정 탭 읽기전용 오버레이 · 둘 다 보기)
-- 설계서 기본 범위 밖의 추가 기능이나 보안 규칙(§10.1)은 그대로 준수한다:
--   · 구글 client secret · refresh token 은 서버 전용. 클라이언트로 절대 안 내려간다.
--   · 모든 구글 호출은 Edge Function(gcal-proxy) 경유. 클라이언트는 테이블에 직접 접근하지 않는다.
--   · 따라서 두 테이블 모두 RLS 켜되 정책/grant 없음 = service_role(=프록시)만 접근(0007 프록시 테이블과 동일 격리).

-- ─────────────────────────────────────────────────────────────
-- 1) 연결 메타데이터 — 커플 양쪽이 (프록시 통해) 읽음(둘 다 보기). refresh token 은 여기 두지 않는다.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.google_calendar_connections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id          uuid NOT NULL REFERENCES public.couples(id),
  owner_id           uuid NOT NULL REFERENCES public.profiles(id),  -- 누구의 구글 계정인가
  provider_email     text,                                          -- 어떤 구글 계정(표시용)
  google_calendar_id text,                                          -- 선택한 캘린더(선택 전 null)
  calendar_summary   text,                                          -- 선택한 캘린더 이름(표시용)
  color              text NOT NULL DEFAULT '#4285F4',               -- 오버레이 색(구글 블루 기본)
  is_enabled         boolean NOT NULL DEFAULT true,                 -- 오버레이 표시 on/off
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid NOT NULL REFERENCES public.profiles(id),
  updated_by         uuid NOT NULL REFERENCES public.profiles(id),
  deleted_at         timestamptz,                                   -- 연결 해제 = soft-delete(§4.3)
  version            integer NOT NULL DEFAULT 1,
  -- 1인 1연결(커플 ≤2 → 연결 ≤2). 해제 후 재연결은 같은 행 재사용(upsert).
  CONSTRAINT uq_gcal_conn_owner UNIQUE (owner_id)
);
CREATE INDEX idx_gcal_conn_couple ON public.google_calendar_connections(couple_id) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 2) refresh token — service_role 전용(정책/ grant 없음 = 클라이언트 접근 0). 절대 클라이언트로 안 내려감.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.google_calendar_tokens (
  connection_id uuid PRIMARY KEY REFERENCES public.google_calendar_connections(id) ON DELETE CASCADE,
  refresh_token text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 3) RLS — 둘 다 켜되 정책 없음. service_role(프록시)만 RLS 우회로 접근(0007과 동일).
--    클라이언트(anon/authenticated)에는 grant 자체를 안 주므로 직접 SELECT/쓰기 불가.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_tokens      ENABLE ROW LEVEL SECURITY;
