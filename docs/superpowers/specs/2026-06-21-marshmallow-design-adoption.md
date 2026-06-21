# 마시멜로 디자인 시스템 도입 — 적용 설계(코드베이스 화해본)

- 날짜: 2026-06-21
- 상태: 설계(분석·결정 완료, 리뷰 대기)
- 소스 팔레트: 사용자 제공 "마시멜로 디자인 시스템" 문서(핑크크림+옐로 2색, 자두 잉크, 핑크틴트 그림자, 겹친 2인 아바타 시그니처). 이 문서는 그 팔레트를 **현 코드베이스·프로젝트 규칙·접근성에 맞춰 화해**시킨 적용 계약이다. 충돌 시 본 문서가 우선.
- 근거: 4-에이전트 감사(토큰 아키텍처 / 규칙·대비 충돌 / 이행 범위) 종합.

## 0. 평결
채택. 현재 코드의 실제 "AI 냄새" 부채(테라코타+무지개 3트랙, 6색 프로필, 검정 그림자 13곳, 그라데이션 셰이머, 가중치 700/800 14곳)를 마시멜로가 토큰 차원에서 정면 교정한다. 도입 구조도 우호적(tokens.css 단일소스, 색 var 353회 소비 → 값 교체가 대부분 자동 반영).

## 1. 사용자 결정(확정)
| 항목 | 결정 |
|---|---|
| 다크모드 | **구조 보존 · 색은 후속**(다크 분기 유지, 평탄화 금지, 진짜 다크 팔레트는 후속 라운드) |
| 적용 범위 | **전 화면 일괄**(R1~R7) |
| 트랙/프로필 색 | **아바타페어 4색 채택**(핑크/옐로/민트/라벤더) |
| 폰트 | **self-host**(Pretendard·Quicksand·Cafe24 Ssurround — 셋 다 OFL 확인됨) |

## 2. 토큰 전략 — 별칭 레이어(빅뱅 리네임 회피)
- `tokens.css`에 마시멜로 평면 토큰을 **1급으로 정의**: `--bg --surface --surface-soft / --ink --ink-muted --ink-faint / --line --line-strong / --pink-100|200|400|600 --pink-ink / --yellow-100|300 --yellow-ink / --like / --ok --ok-soft --ok-ink --danger --danger-soft --danger-ink / --shadow-raised --shadow-floating --focus-ring / --radius-xs|sm|md|lg|xl|pill / 간격(기존 --sp-* 재사용)`.
- 같은 파일에 **호환 별칭 레이어**: `--c-bg:var(--bg); --c-surface:var(--surface); --c-text:var(--ink); --c-text-weak:var(--ink-muted); --c-border:var(--line); --c-brand:var(--pink-600); --c-danger:var(--danger); --c-cta-bg:var(--pink-600); …` → **R1에서 전 화면 색 즉시 반영, 호출부 변경 0.**
- 라운드별로 각 파일 `var(--c-*)`를 마시멜로 이름으로 점진 치환 → R7에서 별칭 레이어 삭제.
- 부족분 신설: 반경 2→6단계, 그림자 0→3단계(검정 그림자 13곳·백드롭 검정 4곳·PlaceSheet:131 완전검정 일괄 치환), pink 4단계·yellow 3단계·시맨틱 soft. 미정의 참조 토큰 6개(`--c-accent` 등)·데드 토큰(`--sp-5`) 정리.

## 3. 색 의미체계 화해(블로커 해소)
- **"2색 규율"은 '브랜드 표면/버튼'에 한정** 해석. 트랙·시맨틱·아바타페어는 **명시적 예외**.
- **캘린더 3트랙 = 아바타페어 4색으로 승격**: `shared=라벤더`(둘의 합집합, 현 퍼플 대응) / `mine=민트`(블루 대체) / `partner=핑크`. 옐로는 트랙 아님(포인트/하이라이트). `track.ts` 도출 규칙(색 저장 안 함·SHARED=합집합색·PERSONAL=소유자색 런타임 도출, CLAUDE §7)은 **불변** — 팔레트만 교체. 심볼(●▲■)+라벨 이중화 **절대 보존·강화**(2색하에서 의존도 ↑).
- **시맨틱 ok 민트 vs 트랙 mine 민트 충돌 방지**: 명도/채도 분리(트랙 민트는 더 밝게/채도↑, ok는 차분). 둘 다 색 단독 금지 — ok/danger=아이콘+텍스트, 트랙=심볼 ▲+라벨 '나'.
- **프로필/출처 색 6→4색**: `profileColor.ts` PROFILE_PALETTE를 아바타페어 4색으로 축소, `defaultColorForRole` → `user_a=라벤더`, `user_b=핑크`(트랙색 충돌 회피 배정). 2인 앱이라 출처점은 항상 이니셜/아바타 동반(색 단독 아님). `profileEditor.test.tsx` hex 단언 갱신, ColorPicker 4색 정렬. 기존 사용자 기존 색은 가장 가까운 4색으로 매핑.

## 4. 다크모드 정책(결정=구조 보존)
- 다크 `@media (prefers-color-scheme: dark)` 분기를 **제거하지 않는다**. 마시멜로 "가짜 다크 금지"는 "라이트값 단순 반전 금지" 품질 요구로 수용.
- R1: 다크 분기를 **마시멜로 톤의 잠정 다크값**으로 채운다(어두운 자두/로즈 표면·밝은 로즈 잉크·알파 재조정 그림자). **다크=라이트 평탄화 금지**(다크 스냅샷이 라이트와 같아져 허위 통과). 진짜 다크 팔레트 정밀 설계는 후속 라운드.
- 다크 비주얼 스모크 게이트(e2e cal-dark/map-dark/us-dark) + `clusterContrast.test.ts` 유지.

## 5. 대비 보정(WCAG AA — 계산값 기반)
| 토큰/조합 | 측정 | 보정 |
|---|---|---|
| `--ink-muted #A98A92` | bg 2.84:1 / surface 3.12:1 (본문 미달) | **≈#8E6B74로 어둡게**(surface 위 4.5:1). 본문/캡션 허용, 그 전엔 큰글씨·장식 라벨 전용 |
| `--ink-faint #C9B2B8` | bg 1.82:1 | **텍스트 금지** — 구분선·플레이스홀더·비텍스트 장식만 |
| `--yellow-ink #9A7A1E` on yellow-100 | 3.57:1 | 작은 텍스트 금지(큰 라벨만). 옐로칩 작은 텍스트는 자두 `--ink` 사용 |
| 강CTA `--pink-600` + 흰글자 | 3.29:1 | **큰버튼 전용** 강제(작은 pink-600 흰글자 금지) |
| `--like #FF7C97` on white | 2.45:1 | **텍스트 색 금지** — 형태(채운 하트+자두 외곽선/핑크칩) 이중화 |
| `--pink-ink #B23A60` on pink-100 | 4.66:1(통과, 여유 0.16) | 다크 핑크칩 토큰은 별도 4.5:1 마진 검증 |
- 게이트: **폰트 크기·가중치 조건부 대비 검사** 도입(같은 색쌍도 큰글씨 3:1 / 본문 4.5:1 분기 판정). 라이트/다크 양쪽.
- (검증된 견고 조합: 주요버튼 pink-400+자두 #5A2438 = 5.75:1, 본문 ink on white = 7.70:1.)

## 6. 하트/마커 화해
- **하트 = ❤️ 리액션(`reactions`) 단일 좋아요 컨트롤**로 좁게 해석(`--like`). 위시 우선순위는 "**강도 스텝 인디케이터**"로 정체성 재정의 — 형태(다중 채움-스텝 vs 단일 ❤️ 칩)·위치(카드 내부 vs 항목 하단)·라벨(N단계 vs 좋아요 N개) 3중 분리 유지(ux §2 준수). 우선순위 스텝퍼는 `--like` 단색 대신 라인/채움 단계.
- **마커 'both(둘 다 찜)' ♥ 글리프 대체**(기본값): `markerVisual.ts`의 ♥를 **채운 별 + 소형 듀얼-도트**로 재설계(모양 이중화 유지, 색각 대응). "둘 다 ♥" 마이크로카피는 카드/리스트 **텍스트 라벨에만** ♥를 남기고 좋아요 리액션과 시각·위치 분리.

## 7. 폰트(self-host, OFL 확인됨)
- 순서 강제: **(1) 가중치 700/800 14곳 → 600 이하 정리** → (2) Pretendard(본문)·Quicksand+Cafe24 Ssurround(디스플레이) `@font-face` self-host → (3) `--font-display` 신설, `--font-sans`를 Pretendard 우선. 가중치 400/500/600만. (weight 정리 전 폰트만 로드 시 faux-bold 깨짐 → 순서 필수.)

## 8. 기본값(미질문 항목 — 이대로 진행)
- **외부 브랜드색 예외**(Q6): GoogleIcon(OAuth 버튼 구글 브랜드색)·네이버 지도 SDK 내부 UI는 2색 규율 **예외 유지**. 우리가 렌더하는 길찾기/코스 폴리라인은 마시멜로 팔레트로(트랙색과 구분되는 전용 색, R5 확정).
- **스냅샷 운영**(Q7): 토큰 교체로 e2e 15장이 전부 변하므로 **라운드별 `--update-snapshots` 재생성 + 육안 시각 리뷰**(라이트/다크). maxDiffPixelRatio 0.02 유지.

## 9. 이행 라운드(전 화면 일괄, R1→R7)
1. **R1 토큰 기반공사**: 마시멜로 평면 토큰+별칭 레이어, 반경 6단계·핑크틴트 그림자 3단계·pink/yellow/시맨틱, 가중치 700/800 정리→폰트 self-host+`--font-display`, 그라데이션 셰이머 2곳(Skeleton/RouteFallback) 대체, 다크 분기 마시멜로 잠정값 교체(평탄화 금지), 미정의/데드 토큰 정리. e2e 1차 재생성.
2. **R2 프리미티브**: Button 3변형(주요 pink-400+자두 pill 500 / 강CTA pink-600+흰글자 큰버튼전용 / 보조 투명+1px line-strong) — 흩어진 ~20개 *Btn 흡수, CtaLink 통합. AvatarPair(겹친 2인+마이크로카피, SourceAvatar 위) / Card·MemoryCard / Input·Field / Chip / Badge / LikeButton / BottomSheet 공용 셸.
3. **R3 장소 도메인**: PlaceSheet/PlaceList/PlaceDetail/PlaceSearch/PlacePreviewDetail/MapSearchOverlay/CollectionManager/Trips·Trash. 우선순위 스텝퍼 vs 리액션 3중 분리, Trash 6색 무지개→2색+아이콘/라벨.
4. **R4 캘린더**: track.ts 4색 재매핑(shared=라벤더/mine=민트/partner=핑크) + 민트 충돌 분리, DayTimeline/CalendarPage/EventSheet/TrackLegend/ScopeSheet/WeekStrip. 심볼+라벨 이중화 보존·강화.
5. **R5 지도**: NaverMap 하드코딩색 토큰화(selfDot/route polyline #4285F4→팔레트), markerVisual 'both' 글리프 비-하트 재설계, profileColor 4색 축소·defaultColorForRole 재매핑, 출처점 이니셜 동반.
6. **R6 추천/온보딩/우리**: CourseSheet/RecommendPage/UsPage/ConnectPage/LoginPage/ValuePreview/ProfileEditor/ColorPicker/DisconnectConfirm. ColorPicker 4색, profileEditor.test 갱신, ConnectPage weight 800 정리.
7. **R7 common 잔여 + 마감**: CtaLink/SourceAvatar/EmptyState/Skeleton/Dialog/ConflictBanner/OfflineQueueBadge/UpcomingFeed/ToastProvider/RouteFallback/ScreenScaffold/TabBar 정렬, **별칭 레이어 삭제**(전 치환 확인), e2e 15장 전수 재생성(라이트/다크), 접근성(색+패턴 이중화) 회귀 점검, 조건부 대비 게이트 추가.

## 10. 게이트(매 라운드)
tsc 0 / vitest / build / playwright(라이트+다크) + 조건부 대비 검사. 색+패턴/라벨 이중화 보존. reduce-motion 존중(모션 150~200ms ease-out, 탭 scale 0.97, 좋아요만 팝).

## 11. 범위 밖
- 기능·데이터·라우팅 로직 변경(시각 표현만). 진짜 다크 팔레트 정밀 설계(후속). 네이티브(P-A 별도). 신규 화면.

## 정직성
스텁 하베스는 실제 폰트 렌더·실기기 색감을 100% 재현 못 함 — 코드/대비계산/스냅샷으로 검증하고, 최종 색·여백 미세조정은 실기기 육안이 남는다(라운드 종료 시 명시).
