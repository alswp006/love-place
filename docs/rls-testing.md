# RLS 격리 테스트 · 이메일+비번 테스트 로그인 (핸드오프)

> P0 DoD / `security-privacy.md §2` / `CLAUDE.md §6`의 "RLS 격리 확인" 게이트를 **라이브로** 검증하는 절차.
> supabase-js를 모킹한 단위 테스트로는 RLS를 진짜 검증할 수 없다(자기 자신만 통과). **실제 두 커플 + 두 사용자 세션**이 필요해 라이브 Supabase 핸드오프가 필요하다.

## 1. 이메일+비밀번호 테스트 로그인 (코드는 구현됨)

- 코드: `src/hooks/useSignInWithPassword.ts` + `LoginPage`의 **개발용 비밀번호 폼**(`import.meta.env.DEV`에서만 노출 — 운영 빌드엔 안 들어감).
- **Supabase 대시보드 선행 작업:**
  1. Authentication → Providers → **Email** 활성화 (Confirm email 켜져 있으면 테스트 계정은 아래처럼 미리 확인 처리).
  2. Authentication → Users → **Add user**로 테스트 계정 2개 생성(예: `test-a@example.com`, `test-b@example.com`), **Auto Confirm User** 체크.
  3. 각 계정으로 앱에서 로그인 → '우리' 탭에서 **서로 다른 커플 2쌍**을 구성(A는 A2와, B는 B2와 — 또는 최소 A·B가 다른 couple_id가 되도록).

## 2. RLS 격리 통합 테스트 실행

테스트 파일: `src/__tests__/rls.integration.test.ts` — 아래 env가 **모두** 있을 때만 실행되고, 없으면 자동 skip(로컬/CI 기본 그린 유지).

```bash
RLS_TEST_URL="https://<project>.supabase.co" \
RLS_TEST_ANON="<anon key>" \
RLS_TEST_A_EMAIL="test-a@example.com" RLS_TEST_A_PASSWORD="<pw>" \
RLS_TEST_B_EMAIL="test-b@example.com" RLS_TEST_B_PASSWORD="<pw>" \
npm run test -- rls.integration
```

검증 항목:
- A가 B 커플의 `places`를 조회 → **0건**(교차 SELECT 차단).
- A가 `couple_id`를 B로 **위조 insert** → 거부(WITH CHECK).
- 미인증 클라이언트의 조회 → 0건.
- A가 B의 `reactions`를 수정 → **0행 영향**(D4, `0009_reactions_rls_fix.sql` 적용 후).

> 단정이 의미 있으려면 B 커플에 places/reactions 시드가 있어야 한다(없으면 해당 케이스는 통과로 넘어가며 "시드 후 재실행" 주석). 정밀 검증은 두 커플에 최소 1건씩 시드 후 실행.

## 3. e2e 자동화 (후속)

테스트 로그인이 깔리면 `e2e/smoke.spec.ts`가 로그인 벽을 넘어 **연결→장소 저장→지도**까지 자동 검증할 수 있다. 비밀번호 로그인 UI(`testId`)로 e2e가 세션을 만든 뒤 핵심 흐름을 스모크하도록 확장 — 별도 작업.
