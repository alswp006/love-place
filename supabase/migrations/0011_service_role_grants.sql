-- 0011 service_role 테이블 권한 복구 — proxy edge functions (03-proxy-contract.md §0)
--
-- 문제(런타임 확인 2026-06): edge function의 admin(service_role) 클라이언트가 couples를
--   조회할 때 `42501 permission denied for table couples` → 검색/프록시가 전부 403.
--   (옛 함수는 이 에러를 삼켜 "커플 없음"으로 오판 → "먼저 상대와 연결" 오안내였음.)
--   원인: 0004는 authenticated/anon 롤에만 GRANT 했고 service_role 권한이 전무.
--   Supabase 기본 default privileges가 이 마이그레이션으로 만든 테이블엔 적용되지 않아,
--   service_role(RLS는 우회하지만 '테이블 GRANT'는 별도 필요)이 어떤 테이블도 못 읽음.
--
-- 수정: service_role(서버 전용·클라이언트 비노출·RLS 우회 admin 롤)에 표준 권한 부여.
--   향후 생성 테이블/시퀀스도 자동 포함되도록 default privileges까지 설정(재발 방지).
-- 적용: Supabase SQL Editor 또는 CLI(db push). 적용 즉시 프록시 정상화(함수 재배포 불필요).
-- 안전성: service_role은 service_role 키로만 접근되며 그 키는 edge function 서버 환경에만 존재.
--   클라이언트(anon/authenticated)의 권한은 0004 그대로 — 이 변경으로 넓어지지 않음.

GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
