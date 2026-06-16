# 전면 UX 개선 — 실앱 수준으로 (전체 앱 감사 기반)

- 날짜: 2026-06-16
- 상태: 진행 중(라운드 분할 구현)
- 범위: 전체 앱 UX 감사(52개 이슈, 실앱 벤치마크) 전량 — 라운드로 분할. 사용자 mandate: "무조건 다 고쳐, 실앱 배워서, 토큰 무제한, 푸시, 반복."

## 0. 이미 처리(데이터 무결성)
- **0012 RLS 멱등 재적용(완료·푸시)**: remote에 0010 휴지통 정책이 실제 미적용이라 **장소 삭제·가봤음 취소·복구가 거짓 충돌로 실패**하던 것 → trash/reactions 정책 재생성으로 복구. (DROP IF EXISTS NOTICE로 누락 확정.)

---

## R1 — P0(사용자 지명) + 안전/지도 감 [이번 라운드]

### R1.1 추천 코스 추가 — 확인·미리보기 + 중복방지 (CRITICAL ×2, 지명)
- 현재 `RecommendPage.onAddCourse`가 클릭 즉시 itinerary+이벤트 최대 6개를 공유 캘린더에 씀(확인·미리보기 없음). 같은 클러스터/양쪽 탭 시 **중복** 무방비.
- 수정: 탭 → **CourseSheet(바텀시트 미리보기)**: 순번 동선 타임라인(buildCoursePlan 출력) + 날짜 선택(기본 다음 주말/내일) + 시작시각 + [함께 캘린더에 추가]/[취소]. 확인 시에만 mutate.
- 중복방지: 결정론 `course_key = coupleId:dayKey:sortedPlaceIds`; 활성 itinerary에 같은 키 있으면 생성 안 하고 "이미 추가됨 · 캘린더에서 보기". **DB(0013 마이그레이션)**: `itineraries.course_key text` + 부분 유니크 인덱스(WHERE deleted_at IS NULL); addCourse를 onConflict-do-nothing/트랜잭션 RPC로(동시 양쪽 탭 DB 차단). 실앱: Google Calendar(iCal UID dedup).

### R1.2 가봤음 취소 — 무동작 성공 제거 (CRITICAL, 지명)
- `useUnmarkVisited`가 호출부의 `visits` 스냅샷에 의존 → stale/빈 경우 active=0인데 {conflicted:false}(성공)로 끝나 토스트만 뜸.
- 수정: mutationFn 내부에서 활성 방문행을 **직접 조회**(supabase.from('visits').select('id,version')…) 후 softDelete. 결과 `{status:'removed'|'noop'|'conflict'}` → 'removed'에만 성공 토스트, 'noop'='이미 취소됨', 'conflict'=배너. onMutate 낙관적 마커 토글 + onError 롤백.

### R1.3 네이버 로고/축척 위치 (CRITICAL, 지명)
- `logoControl/scaleControl:true`인데 position 미지정 → 기본 하단 → 시트와 겹침('네이버 표시 뜸'), ToS 가시성 위반.
- 수정: `logoControlOptions.position = naver.maps.Position.TOP_LEFT`, `scaleControlOptions.position = TOP_RIGHT`(검색 오버레이와 안 겹치게 top 여백). 로고는 모든 snap에서 가시.

### R1.4 시트 전체 드래그 (CRITICAL, 지명)
- 드래그 핸들(작은 버튼)만 드래그 가능 → "앱 같지 않음".
- 수정: peekHeader 전체(핸들+요약+필터)를 드래그 표면으로. body.scrollTop===0에서 아래로 끌면 collapse, peek에서 위로 끌면 expand. handle touch-action:none / body pan-y. ~6px 임계값(탭 vs 드래그). 플릭 속도 기반 스냅(방향). 실앱: Apple/Google Maps 시트.

### R1.5 전역 Toast 프로바이더 + 삭제 Undo (CRITICAL + MAJOR)
- 현재 MapPage·PlaceSheet·RecommendPage가 각자 `<Toast>` 마운트 → 같은 위치 충돌. Toast는 액션 버튼 없음(Undo 불가).
- 수정: 앱 레벨 단일 Toast 프로바이더(context+portal, 큐/스택, **액션 버튼 지원**). per-component useToast 제거.
- 장소 삭제: 단일 탭 즉시 soft-delete → **'실행취소' Undo 토스트(~6s)** → restorePlace. '아래 휴지통' 카피 수정.
- 일정 삭제: 인라인 확인 + 삭제 후 **'되돌리기' Undo 토스트**(restore 경로). 파괴적 버튼 시각 분리.

### R1.6 지도 마커 감 (MAJOR ×3)
- 선택 강조가 pan/zoom에서 사라짐(render가 stale selectedId 클로저) → selectedId를 ref로 읽거나 render 끝에서 재적용.
- 마커 히트영역 <44px → 투명 ≥44px 컨테이너 래핑 + 탭 즉시 scale 피드백 + (가능 시) 햅틱.
- 마커 탭 → 시트 **상세 모드**(리스트 숨기고 PlaceDetail 주요, 명확한 닫기/뒤로) — 구글맵 패턴.

### R1 게이트
tsc 0 / vitest / build / e2e(하베스) green + 0013 db push. 비주얼 하베스 스냅샷 재생성·내 육안 확인. 실기기 감(네이버 로고·드래그)은 사용자 확인 필요로 표기.

---

## R2 — 캘린더 (CRITICAL/MAJOR)
- 일정 삭제 확인+Undo(R1.5에서 일부) / 반복 일정 **범위 선택**(이 일정만/이후/전체, EXDATE·override) / **리마인더가 안 울림** → 인앱 활동 피드(Realtime 기반 'D-3'·'곧 시작') (+PWA설치+iOS16.4 시 알림) / 상대 PERSONAL 이벤트 쓰기 권한 UI 구분(거부 vs 충돌) / 충돌 시 입력 보존+머지 / **요일(타임라인) 뷰**(+주) / 시간 검증(end<start·자정 넘김) / 장소 연결 UI / 로딩 스켈레톤·빈상태 / 타임존(여행 현지시각).

## R3 — 온보딩 / 우리 (CRITICAL/MAJOR)
- **초대코드 유실**(로컬 state만) → PENDING이면 마운트 시 활성 코드 재표시 / 누락된 온보딩 ②색상 ③위치·사진 상호동의(법적) + **프로필 편집기**(이름·색, 기본 대비색) / 연결해제 카피 정직화 + **해제 전 내보내기 필수** / **사진 ZIP+JSON 실제 내보내기**(원본 blob, 양측 동등) / 매직링크 모바일 사파리 함정(재전송 타이머·OTP 코드·OAuth 우선) / 브랜드뉴 사용자 가치 미리보기 or 솔로 모드 / 휴지통 전 엔티티 일반화+삭제일/자동정리 / 연결화면 alert→토스트·코드 자동추출/제출.

## R4 — 감 / 일관성 / a11y (MAJOR/MINOR/NIT)
- 페이지/탭 전환 애니(View Transitions, reduce-motion 존중) / **햅틱**(저장·하트·마커·방문, 시각 병행) / 탭별 로딩 스켈레톤 일관 / safe-area·오프셋 토큰 단일화 / 클러스터 탭 fitBounds(멤버 바운즈) / 백드롭 진행형 딤 / 선택핀 transform-origin tip / 트랙 범례 색+이름칩 / 타입 스케일 램프 / disconnect 진짜 모달(focus trap) — 공용 Dialog 프리미티브 추출 / 마커 키보드 / retro·SEED 죽은 텍스트 활성화.

---

## 진행 방식
각 라운드: 계획(조사→초안→critic→revise) → 구현(서브에이전트 TDD+리뷰) → 게이트 검증 → 메인 푸시 → 다음 라운드. R1부터 즉시.

## 정직성(검증 한계)
스텁 하베스는 네이버 주입 DOM·실기기 손맛을 못 봐 — 코드/테스트/하베스 DOM으로 검증하고, 네이버 로고 위치·드래그 손맛·햅틱은 실기기 육안 확인이 남음(라운드 종료 시 명시). 픽셀로 못 보는 건 실앱 표준 패턴으로 확정 적용.
