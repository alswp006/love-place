# love_place 라이브 셋업 가이드 (핸드오프)

> 이번 작업분은 전부 **코드 도입 완료·로컬 게이트 그린** 상태입니다. 실제로 켜려면 아래를 *당신의* Supabase/배포에 적용하세요.
> 순서대로 하면 됩니다. ⚠️ 표시는 이번 작업에서 새로 생긴 의존성.

## 0. 사전: 환경변수 (`.env`)
공개값만(§10.1, 비공개 키는 Edge Function 시크릿). `.env`는 gitignore.
```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_NAVER_MAP_CLIENT_ID=<NCP Web Dynamic Map Client ID>   # 도메인 등록
```

## 1. 마이그레이션 적용 (Supabase SQL Editor 또는 CLI)
`supabase/migrations/`를 번호순(0001→0010)으로 적용. 이미 0001~0008이 적용돼 있으면 **신규 2개만**:
- ⚠️ `0009_reactions_rls_fix.sql` — reactions 쓰기를 본인(`user_id=auth.uid()`)만으로 제한(D4 보안).
- ⚠️ `0010_trash_rls.sql` — 삭제 행 조회·복구 허용(휴지통/복구 D3).

CLI 예: `supabase db push` (또는 SQL Editor에 파일 내용 붙여넣기).

## 2. Edge Functions 배포 + 시크릿
```
supabase functions deploy naver-search
supabase functions deploy ai-route        # ⚠️ 신규
supabase functions deploy blog-publish    # ⚠️ 신규

supabase secrets set \
  NAVER_SEARCH_CLIENT_ID=... NAVER_SEARCH_CLIENT_SECRET=... \
  ANTHROPIC_API_KEY=...            # ⚠️ ai-route용(없으면 결정론 폴백으로 동작)
  # 선택: ANTHROPIC_MODEL=claude-sonnet-4-6
```
- `ai-route`: JWT 검증 + 분/일 레이트리밋 + **월 비용 상한(MONTHLY_CAP=100)** + 캐시 + 화이트리스트 검증 + 폴백 내장.
- CORS Origin 화이트리스트를 앱 도메인으로 제한(`_shared/cors.ts`).

## 3. Storage 버킷 (블로그 발행용 — P5)
- `photos` (**비공개**) — 원본 사진.
- `blog-public` (**공개**) — EXIF 제거된 발행 가공본.
- `blog-publish` 함수가 원본 다운로드→EXIF/GPS 스트립→공개 버킷 재업로드.

## 4. Auth
- **Email provider 활성화** → 비번 테스트 로그인(`import.meta.env.DEV`에서만 노출). 테스트 계정은 Users에서 Add user + **Auto Confirm**.
- Google OAuth: Redirect URL에 `<origin>/auth/callback` 등록.
- 매직링크: 동일 redirect 등록.

## 5. Realtime
`0005_realtime.sql`이 publication에 테이블 추가. 대시보드 Database→Replication에서 `supabase_realtime` 활성 확인.
- (선택 개선) `couples`/`profiles`도 추가하면 상대 색/아바타 변경이 실시간 전파(현재 미포함 — 7단계 부분 갭).

## 6. 검증 — RLS 격리 통합 테스트
`docs/rls-testing.md` 참고. 두 테스트 계정(서로 다른 커플) 프로비저닝 후:
```
RLS_TEST_URL=... RLS_TEST_ANON=... \
RLS_TEST_A_EMAIL=... RLS_TEST_A_PASSWORD=... \
RLS_TEST_B_EMAIL=... RLS_TEST_B_PASSWORD=... \
npm run test -- rls.integration
```
교차 SELECT 0 / couple_id 위조 거부 / D4 reactions 소유권 확인.

## 7. 배포 (Railway)
- 빌드 ARG로 `VITE_*` 주입(Dockerfile 참고). `npm run build`(tsc+vite) → Caddy SPA 서빙.
- **순서 중요:** 1~2(마이그레이션·함수)를 *먼저* 적용한 뒤 코드를 main에 머지/배포. 안 그러면 0009/0010에 의존하는 경로(휴지통 복구·reactions)가 실패.

## 체크리스트
- [ ] 0009·0010 적용
- [ ] ai-route·blog-publish 배포 + 시크릿
- [ ] photos·blog-public 버킷 생성
- [ ] Email provider 활성화 + 테스트 계정
- [ ] RLS 통합 테스트 그린
- [ ] (그 후) main 머지 → 배포
