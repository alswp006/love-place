# 작업계획서 — 할 일 관리·공유 사용성 (2026-07)

> **상태: P1~P5 전부 완료** (`ddc265f` P1 · `ddc9e7d` P2 · `caf04b2` P3 · `4cccfbc` P4 · `8f9c056` P5).
> 남은 것은 **배포 두 건**뿐이다(아래 §0의 마이그레이션 0018·0019 + directions 함수).
> 계획 대비 달라진 점:
> - P3-a가 갈아야 한다고 예고했던 기존 테스트 2건은 예고대로 갈았다(+ placeSearch 1건이 더 있었다).
> - P5에서 `orderById`를 마커 effect deps에 빠뜨리면 Day 전환 시 이전 번호가 남는 **실제 버그**가
>   있었고 lint 경고로 잡혔다.
> - 계획에 없던 곁가지: routing 테스트 첫 케이스가 lazy 청크 때문에 전체 스위트에서 플레이키했다(타임아웃 상향).

> 근거: 투두메이트 분석 워크플로(조사 3 + 코드감사 4 + 종합 2 + 결선·비평 2, 에이전트 11).
> 이미 반영된 것: 아젠다 한 줄 추가 · 여행 담기 흐름 · 스톱 딥링크 · 일정 댓글 (`e435186`).
> **제외(사장님 지시):** J 오프라인 큐 · K 인앱 활동 피드 · L EventSheet 점진 공개.

---

## 0. 전제 — 이 환경에서 확인할 수 없는 것

원격 리눅스 컨테이너에는 **실 Postgres가 없다.** 따라서 RLS·제약 관련 항목은
"정책/코드를 읽어 도출한 결론"이며 실 DB 재현이 아니다. 아래 표기를 따른다.

- **[정적확인]** — 마이그레이션·소스를 읽어 확인. 재현은 안 함.
- **[미검증]** — 워크플로가 주장했으나 근거가 부족해 그대로 쓰지 않음.

수정 자체는 **어느 증상이 맞든 옳은 방향**일 때만 진행한다. 증상 서술을 커밋 메시지·
테스트 이름에 단정하지 않는다.

---

## 1. 순서와 그 이유

의존성이 실제로 걸린 곳은 두 군데뿐이다. 나머지는 주제별로 묶었다.

```
P1 (내 결함)     ─┐
P2 (공유 신호)   ─┼─ 서로 독립, 순서 무관
P5 (트리플 근접) ─┘

P3-0 (42P10 방어) ── P3 (저장 3탭) ── 선행 필수
P4-0 (0019 RLS)  ── P4 (찜 토글)   ── 선행 필수
```

**P1을 맨 앞에 둔다.** 내가 직전 커밋들에서 만든 결함이고, 둘 다 작으며,
"오탭 한 번에 상대가 담아둔 걸 날리는" 종류라 커플 앱에서 가장 아프다.

---

## P1 — 여행 스톱 삭제 계약 통일 (내 결함)

### P1-a. 스톱 빼기에 확인 + 되돌리기
- **문제** [정적확인]: `TripDetailPage`의 ✕는 `remove.mutate(...)` **1탭 즉시 실행**.
  확인도 Undo도 성공 토스트도 없다. 같은 `events`를 캘린더는 "인라인 확인 2탭 +
  되돌리기 토스트"(`useSoftDeleteWithUndo`)로 지우고, 방문 취소·여행 삭제·장소 삭제도
  전부 그 훅을 쓴다. 화면마다 삭제 계약이 다르다.
- **변경**: `useEventMutations`의 raw `remove` 대신 `useSoftDeleteWithUndo('events', …)`.
  아젠다와 같은 1탭=확인 / 2탭=삭제 + Undo 토스트.
- **DoD**: 1탭으로는 안 지워진다 / 2탭에서 `version` 조건부 / 되돌리기 토스트가 뜬다.
- **테스트**: `tripDetailPage.test.tsx`에 확인 2탭 + Undo 케이스.

### P1-b. 상대 PERSONAL 스톱 ✕ 오안내 차단 + 소유자 표시
- **문제** [정적확인]: 상대의 PERSONAL 일정이 스톱으로 잡히면 ✕가 보이는데,
  RLS `events_update`(SHARED이거나 owner 본인만)가 0행을 돌려주고 앱이 그걸
  **"상대가 먼저 수정했어요"(충돌)로 잘못 안내**한다. 실제로는 권한 문제다.
- **변경**: `stopsOfDay`가 이미 `EventRow`를 제네릭 통과시키므로 `visibility`/`owner_id`가
  그대로 온다(비평가 확인 — 별도 배선 불필요). 캘린더의 `canEdit` 규칙을 그대로 미러해
  상대 PERSONAL이면 ✕를 감추고, 모든 스톱에 `SourceAvatar` + 트랙 심볼(●▲■)+라벨.
- **DoD**: 상대 PERSONAL 스톱에 ✕ 없음 / 거짓 충돌 배너 안 뜸 / 소유자가 색이 아니라
  텍스트·심볼로도 구분됨(§8).
- **테스트**: 상대 PERSONAL 스톱 ✕ 부재, 내 것·SHARED는 존재.

---

## P2 — 상대의 존재를 화면에 드러내기

### P2-a. 동선 열람 고지 렌더 (법적 — 최우선)
- **문제** [정적확인]: `useLocationProvideFeed`의 참조가 저장소 전체에서 **정의부 1줄뿐**
  (호출 0). 서버 로깅(`location_access_log` PROVIDE) · 도출(`lib/journey/provideLog.ts`
  IMMEDIATE/BATCHED_30D) · vitest 6케이스까지 완성인데 표시 한 칸이 비었다.
  `docs/legal/location-policy.md:22`는 이용자에게 "앱 내 활동 피드로 통지합니다"라고
  **이미 약속**해 두었다.
- **변경**: `LocationControlCenter`에 슬롯 추가. `useConsent`의 `notify_mode`를 넘겨
  `useLocationProvideFeed(coupleId, userId, notifyMode)` 호출 → "상대가 내 여행 동선을
  열람했어요 · 3일 전" 목록. 빈 상태·스켈레톤 포함. 위치는 '즉시 중단' 아래.
- **DoD**: 열람 기록이 화면에 뜬다 / 빈 상태가 죽어 있지 않다.
- **주의**: 상대를 감시하는 기능이 아니라 **내 데이터가 어떻게 쓰였나를 나에게** 보여주는
  방향이어야 2인 대칭이 유지된다.

### P2-b. UpcomingFeed에 출처 + 트랙 + 딥링크
- **문제** [정적확인]: `FeedItem`(`lib/calendar/upcomingFeed.ts`)에 actor/owner/track 필드가
  없다. `useEvents`는 SHARED와 양쪽 PERSONAL을 모두 반환하므로 **상대의 개인 일정이
  지도 첫 화면에 누구 것인지 표시 없이** 섞여 뜬다. 캘린더 아젠다에선 트랙으로 구분되던
  정보가 첫 화면에서만 사라진다. `<li>`가 비인터랙티브라 눌러도 갈 곳이 없다.
- **변경**: `FeedItem`에 `ownerId` + `track`(`deriveTrack`) 추가(순수 함수라 vitest로 고정).
  `UpcomingFeed`에 `SourceAvatar` + `TRACK_META`의 심볼+라벨 병기, 내용을
  `/calendar?date=` 링크로 감싼다.
- **DoD**: 누구 일정인지 색 없이도 읽힌다 / 탭하면 그 날짜로 간다.

### P2-c. 리액션에 "누가 눌렀나"
- **문제** [정적확인]: `aggregateReactions`가 `{count, didIReact}`로 접으며 `user_id`를
  버린다(`lib/places/aggregateReactions.ts:12-21`) → "상대가 하트를 눌렀어요"라는 문장이
  앱 어디에도 없고 숫자만 조용히 +1 된다.
- **변경**: 집계에 `userIds: string[]` 추가(기존 필드는 유지 — 호출부 무변경).
  `LikeButton`의 `aria-label`과 칩 텍스트를 "상대도 하트를 눌렀어요"류로.
- **DoD**: 2인 기준 문장이 정확하다(나만/상대만/둘 다) / 기존 호출부가 안 깨진다.
- **테스트**: `aggregateReactions.test.ts`에 userIds 케이스 추가.

---

## P3 — 장소 저장 흐름

### P3-0. `savePlace` 42P10 방어 (P3의 선행)
- **문제** [정적확인]: `savePlace.ts:86-95`의 wish upsert가
  `onConflict:'place_id,user_id' + ignoreDuplicates`인데, 매칭 인덱스는
  `0002:26-27`의 **부분 유니크(`WHERE deleted_at IS NULL`)뿐**이고
  `0001`의 테이블 정의에 plain UNIQUE가 **없다**(직접 확인). Postgres는 index_predicate
  없이 부분 인덱스를 arbiter로 추론하지 않으므로 **42P10으로 통째로 throw할 수 있다**.
  그러면 "3탭 복구"가 고치려는 그 저장이 0탭째부터 실패다.
- **변경**: upsert를 버리고 `useToggleReaction`과 같은 **select-then-insert**로.
  (부분 유니크는 그대로 두어야 한다 — plain UNIQUE로 바꾸면 soft-delete된 wish가
  재찜을 막는다. 마이그레이션 없이 클라이언트만 고친다.)
- **DoD**: 같은 장소를 두 번 저장해도 wish가 1건 / 해제 후 재찜이 새 행으로 들어간다.
- **주의**: 실 DB 재현은 못 했다. 다만 이 변경은 위험을 제거하고 동작은 동일하므로
  확인을 기다릴 이유가 없다.

### P3-a. 저장 3탭 복구
- **문제** [정적확인]: `PlaceSheet.tsx:189`가 `if (selectedId && snap === 'peek')` —
  **이미 저장된** 장소만 자동 승격되고, 저장 버튼을 눌러야 하는 `previewHit`은 대상이
  아니다. 게다가 `MapSearchOverlay.tsx:22` `const collapsed = snap !== 'peek'`라
  시트가 half만 돼도 검색창이 숨는다. 둘이 맞물려 §8이 약속한 ≤3탭이 실제로는 4탭이다.
  저장소 자신의 e2e(`map-harness.spec.ts:128`)가 "시트 펼치기"를 클릭하며 이를 증언하는데,
  유닛(`mapPagePreview.test.tsx`)은 `PlaceSheet`를 스텁으로 갈아끼워 마찰을 가린다.
- **변경**: 승격 조건에 `previewHit` 포함(deps 추가) + `collapsed`를 `snap === 'full'`로 좁힘
  + 검색 결과 `max-height` 조정(half와 겹침 회피).
- **⚠️ 같이 갈아야 하는 기존 테스트 2개** (원 제안이 빠뜨린 부분):
  - `e2e/map-harness.spec.ts:80` — 이름 자체가 "half로 펼쳐지면 접힌다"이고
    `data-hidden=true`를 단정 → 폐기·재작성
  - `src/__tests__/mapSearchOverlay.test.tsx` 세 번째 케이스 — 동일
  (이 규칙을 요구하는 스펙 문장은 `.ai-factory/01-spec.md`에 없다 — 근거는 소스 주석뿐이라
   스펙 개정이 아니라 테스트 개정으로 끝난다.)
- **DoD**: 저장까지 클릭 3회 이하 회귀 테스트 추가. `PlaceSheet`를 모킹하지 **않는**
  통합 케이스로 셀 것.
- **⚠️ 표현 주의**: e2e 시드(`harness/seed.ts:80-88`)는 메서드 무관 정적 JSON이라
  POST도 항상 200이다. 이 게이트는 "저장 **요청**까지의 탭 수"이지 성공이 아니다.
  테스트 이름에 그렇게 쓴다.

### P3-b. 검색 결과 탭해도 검색어·키보드 유지
- **문제** [정적확인]: `PlaceSearch` 결과 onClick이 `onPick(hit); clear(); blur()`.
  여러 곳을 몰아 담을 때 매번 재타이핑부터 시작한다.
- **변경**: `clear()`·`blur()` 제거(또는 저장 후에도 쿼리 유지).
- **⚠️ 실기기 확인 항목**: `PlaceSheet.tsx:151`이 `setVh(window.innerHeight)`인데
  iOS Safari는 키보드가 떠도 `innerHeight`가 줄지 않는다. half(ratio 0.5) 기준 저장
  버튼이 화면 55~60% 지점이라 **키보드 상단과 겹칠 수 있다**. 시뮬레이터가 아니라
  실기기에서 한 번 봐야 한다.

---

## P4 — 찜 토글 (마이그레이션 포함)

### P4-0. `0019` wishes·reactions 휴지통 RLS (P4의 선행)
- **사실** [정적확인]: `0010`은 places/trips/visits/photos/itineraries/events에만 trash
  정책을 깔고, 주석에 "(wishes는 사용자 삭제 UI 없음 → 생략. reactions는 0009에서 처리)"
  라고 적었다. 실제 `0009`의 `reactions_select`는 `deleted_at IS NULL`만 본다.
  즉 두 테이블에 휴지통 정책이 **없다**.
- **[미검증]** 워크플로는 이게 "거짓 충돌 배너"를 낸다고 썼으나 비평가가 반박했다 —
  `UPDATE ... RETURNING`의 RLS 동작상 **무음 실패**일 수도 있고, 두 경로(soft-delete /
  restore)의 증상이 서로 다르다. **증상을 단정하지 않는다.**
- **변경**: `0019_wish_reaction_trash_rls.sql` — `0010`/`0018`과 동형으로
  `wishes_trash_select/update`(couple 격리), `reactions_trash_select/update`
  (`0009` 철학대로 `user_id = auth.uid()` 범위).
  정책 공백은 증상과 무관하게 실재하므로 메우는 것이 맞다.
- **⚠️ 게이트 아님**: `src/__tests__/rls.integration.test.ts:15`는 `describe.skipIf`이고
  환경변수 6개가 있어야 돈다. 여기에 케이스를 넣어도 **기본 CI에선 스킵된다.**
  CLAUDE.md §6이 "CI 게이트"라고 적은 것과 현실이 다르다 — 문서도 같이 정정한다.

### P4-a. '나도 찜' / '찜 해제' 토글
- **문제** [정적확인]: `wishes`에 쓰는 경로가 `savePlace`의 upsert 하나뿐이다.
  이미 저장된 곳을 검색해 탭하면 `selectedId`만 세팅돼 **내 wish가 생기지 않고**,
  `PriorityStepper`는 `myWish`가 있을 때만 렌더(`PlaceList.tsx:113`)라 상대가 담은
  장소에 내 의도를 남길 컨트롤이 **아예 없다**. 코드가 스스로 핵심 신호라고 적어둔
  `bothWished`(`wishStatus.ts:15` — ✦ 마커·최상단 정렬)에 도달할 정상 경로가 없다.
  역방향도 없어 "내 마음이 식었다"와 "우리 장소를 지운다"가 같은 🗑 하나다.
- **변경**: `useToggleWish` 신설 — `useToggleReaction`과 동형(mutationFn에서 내 살아있는
  wish를 직접 재조회해 stale-cache race 회피 → 있으면 `softDelete`, 없으면 **plain insert**).
  insert여야 하는 이유는 P3-0과 같다(부분 유니크). UI: `myWish` 없으면 '＋ 나도 찜',
  있으면 기존 `PriorityStepper`. 해제 시 되돌리기 토스트.
- **부작용 고지**: 양쪽 wish가 모두 없어지면 그 장소는 여행 담기 후보에서 빠진다
  (지도에는 남음). 후보 패널 빈 상태 문구에 반영.
- **DoD**: 상대가 담은 장소에 내 찜을 더할 수 있다 / 해제가 `version` 조건부다 /
  해제 후 재찜이 된다 / `bothWished`(✦)에 도달한다.

---

## P5 — 트리플 근접 (별도 트랙)

`.claude/commands/trip-ux-review.md`의 ①②③만. ④⑤⑥은 이번 범위 밖.

### P5-a. 번호 배지 ↔ 지도 마커 번호
트리플의 시그니처. 지금 리스트에 번호가 없고 마커도 기본 별표라 "순서 있는 하루"로
안 읽힌다. `NaverMap`에 번호 마커 **optional prop** 추가(기존 호출부·리캡 무영향).
색만으로 구분하지 않게 숫자 텍스트를 마커에 넣는다.

### P5-b. 지도 ↔ 리스트 연동
`NaverMap`이 이미 `selectedId`/`onSelect`를 받는데 여행 상세에서 안 쓴다. 배선만 하면
스톱 탭 → 마커 강조, 마커 탭 → 리스트 스크롤이 된다.

### P5-c. 스톱 카드 정보 밀도
`places.category`·`region_label`이 이미 있다(`usePlaces`). **사진 썸네일은 하지 않는다** —
P3c 미구현이라 데이터가 없고, 회색 플레이스홀더는 빈 화면보다 나쁘다.

---

## 2. 공통 규칙 (모든 단계)

- 단계마다 **7게이트 전부** 통과 후 커밋. 한 커밋에 여러 단계를 섞지 않는다.
- 기존 테스트를 **고쳐서** 통과시키지 않는다. 의도적으로 동작을 바꿨다면 테스트도 바꾸되
  커밋 메시지에 **왜인지** 쓴다(P3-a가 유일한 해당 사례).
- 스냅샷 베이스라인은 darwin뿐이라 리눅스 CI는 스킵된다. 여기서 리눅스 베이스라인을
  만들지 않는다(기존 관례 유지).
- 새 UI마다 빈 상태·로딩·에러를 둔다. 색만으로 구분하지 않는다. 터치 타깃 ≥44px.
- 실 DB가 필요한 결론은 **[미검증]**으로 남기고 단정하지 않는다.

## 3. 하지 않는 것

| | 이유 |
|---|---|
| J 오프라인 큐 연동 | 사장님 지시 제외 |
| K 인앱 활동 피드 | 사장님 지시 제외 (비평가도 "추가/하트만 덮고 삭제·변경은 구조적으로 불가"로 범위 과대 지적) |
| L EventSheet 점진 공개 | 사장님 지시 제외. 단 여기 딸린 **22시간 일정 버그**(시작만 바꾸면 자정 넘김 해석)는 별도로 남는다 |
| 꾸미기(스티커·테마) | 절제된 톤과 방향 반대 |
| 피드형 소셜(팔로우·스트릭) | 2인 앱에 불필요 |
| 자연어 입력 파싱 | 오파싱 시 조용히 틀린 날짜 |
| 스와이프 삭제 | 발견성 낮아 버튼 대체 경로가 어차피 필요 |
