# 데이터베이스 적용 가이드 (P0c)

> 이 폴더의 SQL 6개가 love_place의 전체 데이터베이스입니다.
> **로컬 Postgres 16에서 실제 실행·동작 검증을 마쳤습니다** (스키마·트리거·제약·뷰·RLS 격리 전부 PASS).
> 너는 아래처럼 **Supabase 대시보드에 복붙 → Run** 만 하면 됩니다. (코딩 아님, 복사·붙여넣기·클릭)

## 적용 순서 (반드시 이 순서대로)

Supabase 대시보드 → 왼쪽 **SQL Editor** → **New query** → 아래 파일 내용을 **순서대로** 붙여넣고 매번 **Run**:

1. `0001_core_schema.sql` — 테이블 11개
2. `0002_indexes_views.sql` — 인덱스 + 상태 뷰
3. `0003_triggers.sql` — 자동 갱신 + **가입 시 프로필 자동 생성**
4. `0004_rls_grants.sql` — 보안(RLS) + 권한(GRANT)
5. `0005_realtime.sql` — 실시간 동기화
6. `0006_regions_seed.sql` — 지역 데이터(속초·강릉·제주 등)

> 한 파일씩 따로 Run 하는 게 안전합니다. 6개를 한 번에 붙여 Run 해도 되지만, 에러 시 어디서 났는지 찾기 쉽게 하나씩 권장.
> "Success. No rows returned"이 나오면 정상입니다.

## 적용 후 확인 (선택)

SQL Editor에서 이걸 Run 하면 잘 됐는지 한눈에 보입니다:

```sql
select
  (select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE') as 테이블수,  -- 11
  (select count(*) from public.regions) as 지역수,                                                                       -- 37
  (select count(*) from pg_tables where schemaname='public' and rowsecurity) as RLS켜진테이블;                          -- 11
```

기대값: 테이블 11 / 지역 37 / RLS 11.

## 왜 이렇게 설계됐나 (요약)

- **GRANT + RLS 둘 다 필요**: 네 프로젝트는 "새 테이블 자동 노출 OFF"라서, 보안(RLS)만으로는 앱이 접근 못 한다 → `authenticated`(로그인 사용자) 롤에 명시적 GRANT를 줬다. (0004)
- **RLS = 둘만의 자물쇠**: 모든 공유 테이블에 `couple_id` 기준 정책 → 다른 커플 데이터는 보이지도, 쓰지도 못한다. (실제 격리 검증 완료)
- **프로필 자동 생성**: 매직링크로 처음 로그인하면 `profiles` 행이 자동 생성된다 → 로그인 직후 앱이 안 깨진다. (0003)
- **지역 시드 한계**: 시드에 없는 시군구 장소를 저장하려 하면 실패할 수 있다 → P1b에서 "없으면 자동 추가" 처리 예정. (0006 주석 참고)

## 로컬에서 다시 검증하려면 (개발자용)

```bash
# OrbStack/Docker 실행 후
docker run -d --name lp-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=t postgres:16-alpine
# auth 스키마·롤 shim 깔고 0001~0006 순서대로 psql 실행 → 에러 0이면 OK
```
