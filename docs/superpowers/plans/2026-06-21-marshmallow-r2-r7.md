# 마시멜로 R2~R7 통합 구현계획

> REQUIRED SUB-SKILL: 라운드별로 subagent-driven(워크플로) 또는 inline 실행. 각 라운드 = TDD 구현 → 게이트(tsc0/vitest/build/e2e 라이트+다크) → 스냅샷 재생성 → main 푸시.
> 전제: `docs/superpowers/specs/2026-06-21-marshmallow-design-adoption.md`. R1 완료(별칭 레이어로 전 화면 마시멜로 색 적용·토큰 대비 게이트·폰트 self-host).

**원칙(전 라운드 공통):**
- 마시멜로 1급 토큰(`--bg --ink* --pink* --yellow* --mint*/--lavender* --like --ok*/--danger* --shadow-* --focus-ring --r-*`) 사용. 신규/이행 코드는 `--c-*` 별칭 대신 1급 이름.
- 반경: 사진/인풋 `--r-md`(14), 카드/시트 `--r-lg`(20), 칩/버튼 `--r-pill`, 모달 `--r-xl`. 그림자 3단계만(라이트 검정 금지). 그라데이션 금지. 가중치 400/500/600.
- 색만으로 상태 구분 금지(색+패턴/라벨 이중화 보존·강화). reduce-motion 존중(150~200ms, 탭 scale(0.97), 좋아요만 팝).
- 기능·데이터·라우팅 불변(시각만). 매 라운드 e2e 스냅샷 의도적 재생성(`npm run build:e2e && SEED_SNAPSHOT=1 npx playwright test --update-snapshots`).

---

## R2 — 공용 프리미티브 신설 + 1차 채택
공용 프리미티브가 없고 ~20개 버튼 클래스가 흩어져 있음 → 정본 프리미티브를 만들고 흡수.

- **T1 Button** (`src/components/ui/Button.tsx` + css): 변형 `primary`(bg `--pink-400`+자두 `#5a2438`, `--r-pill`, weight500) / `cta`(bg `--pink-600`+흰글자, 큰버튼 전용) / `ghost`(투명+1px `--line-strong`+`--ink`) / `danger`(soft). `as`=button|link(Link 통합). 탭 `scale(0.97)`, 포커스 `--focus-ring`. 테스트: 변형별 클래스·role·disabled.
- **T2 Card / MemoryCard** (`src/components/ui/Card.tsx`): `--surface`, `--r-lg`, 1px `--line`, `--shadow-raised`, 패딩 16~20.
- **T3 Chip / Badge** (`src/components/ui/Chip.tsx`): pill, `--pink-100`/`--pink-ink`(기본), 시맨틱 변형(ok/danger soft+ink, 아이콘+텍스트).
- **T4 Field / Input** (`src/components/ui/Field.tsx`): `--surface-soft`, `--r-md`, 1px `--line`, 포커스 `--focus-ring`.
- **T5 AvatarPair(시그니처)** (`src/components/ui/AvatarPair.tsx`): 겹친 2인(둘째 `margin-left:-8px`), 아바타페어 4색, `SourceAvatar` 위에 빌드. "둘 다 ~함" 마이크로카피 슬롯. 테스트: 2 아바타 렌더·겹침·라벨.
- **T6 LikeButton** (`src/components/ui/LikeButton.tsx`): 단일 ❤️ 좋아요(`--like` 형태 이중화, 텍스트색 아님), 통통 팝(reduce-motion 생략). aria-pressed+카운트.
- **T7 BottomSheet 공용 셸**(선택): EventSheet/PlaceSheet 공통 백드롭+시트 구조 추출(이미 Dialog 있음 — 중복 흡수 가능 범위만).
- **T8 1차 채택**: LoginPage/UsPage 등 가장 흔한 버튼을 Button으로 교체(패턴 확립). 흩어진 *Btn 일부 흡수.
- 게이트 + 스냅샷 재생성 + 푸시.

## R3 — 장소 도메인
대상: PlaceSheet/PlaceList/PlaceDetail/PlaceSearch/PlacePreviewDetail/MapSearchOverlay/CollectionManager/TripsSection/TrashSection.
- 프리미티브(Button/Card/Chip/Field/LikeButton) 적용. 필터 칩·목록 카드·상세 카드 마시멜로화.
- **우선순위 스텝퍼 vs ❤️ 리액션 3중 분리 유지**(형태/위치/라벨) — 리액션만 LikeButton, 우선순위는 강도 인디케이터(하트 모양이면 라인/채움 단계, --like 단색 금지).
- TrashSection 카테고리 색 무지개 흔적 → 2색+아이콘/라벨.
- 호출부 `var(--c-*)` → 마시멜로 이름 치환(이 도메인 파일들).
- 게이트 + 스냅샷(map-*) 재생성 + 푸시.

## R4 — 캘린더 (트랙 4색)
대상: track.ts / DayTimeline / CalendarPage / EventSheet / TrackLegend / ScopeSheet / WeekStrip.
- **track.ts TRACK_META 팔레트 교체**: shared=`--lavender-ink` / mine=`--mint-ink` / partner=`--pink-600`. 도출 규칙 불변(색 저장 안 함). 별칭 `--c-track-*`는 이미 R1에서 매핑됨 — 가능하면 1급 직접 참조로 치환.
- **트랙 민트 vs ok 민트 명도 분리** 확인(이미 mint-ink #2f7d62 vs ok #4fb58a). 심볼(●▲■)+라벨 이중화 **보존·강화**.
- EventSheet/폼 프리미티브(Field/Button) 적용, 칩·배지 마시멜로화.
- 호출부 alias→1급 치환(캘린더 파일).
- 게이트 + 스냅샷(cal-*) 재생성 + 푸시.

## R5 — 지도
대상: NaverMap(.tsx/.module.css) / markerVisual.ts / profileColor.ts / SourceAvatar.
- NaverMap 하드코딩색 토큰화: selfDot/route polyline `#4285F4` 등 → 마시멜로(폴리라인은 트랙색과 구분되는 전용색, 예: `--pink-600`; 네이버 SDK 내부 UI는 예외). 여러 `#fff`→토큰.
- **markerVisual 'both' ♥ → 비-하트 모양**(채운 별+소형 듀얼-도트). 모양 이중화 유지(색각). "둘 다 ♥"는 카드/리스트 텍스트 라벨에만.
- **profileColor.ts 6색 → 아바타페어 4색**(핑크/옐로/민트/라벤더), `defaultColorForRole` user_a=라벤더/user_b=핑크(트랙색 충돌 회피). 출처점 이니셜 동반. `profileEditor.test.tsx` hex 단언 갱신. ColorPicker 4색 정렬(R6와 협응).
- 게이트 + 스냅샷(map-*) 재생성 + 푸시.

## R6 — 추천 / 온보딩 / 우리
대상: CourseSheet / RecommendPage / UsPage / ConnectPage / LoginPage / ValuePreview / ProfileEditor / ColorPicker / DisconnectConfirm.
- 프리미티브 전면 적용. ColorPicker를 아바타페어 4색으로(R5 profileColor와 일치), `var(--c-accent, #3b6db5)` 잔재 제거.
- AvatarPair 시그니처를 헤더/카드에 배치(출처 표시 강화).
- 호출부 alias→1급 치환(이 도메인 파일).
- 게이트 + 스냅샷(us/connect/login) 재생성 + 푸시.

## R7 — common 잔여 + 별칭 삭제 + 마감
대상: CtaLink/SourceAvatar/EmptyState/Skeleton/Dialog/ConflictBanner/OfflineQueueBadge/UpcomingFeed/ToastProvider/RouteFallback/ScreenScaffold/TabBar + 전역 잔여.
- 남은 `var(--c-*)` 전수 치환 확인 후 **tokens.css의 별칭 레이어 삭제**(grep으로 잔존 0 확인 — 있으면 치환).
- 조건부 대비 게이트에 yellow-ink/강CTA/like 용법 포함 확장(있으면).
- 전 게이트 + e2e 15장 전수 재생성(라이트+다크) + 접근성(색+패턴 이중화) 회귀 점검 + 푸시.

---

## 라운드 공통 게이트(완료 조건)
tsc 0 / vitest(contrast·tokensContrast 포함) / build / e2e(라이트+다크 스냅샷 재생성·통과). 색+패턴/라벨 이중화 보존. reduce-motion 보존. 기능·데이터 불변(N/A: RLS/EXIF).

## 정직성
실제 폰트 렌더·실기기 색감은 헤드리스가 100% 재현 못 함 — 토큰/대비/스냅샷으로 검증, 실기기 육안은 사용자 몫(라운드 종료 시 명시). Cafe24 디스플레이는 woff2 투입 전 폴백.
