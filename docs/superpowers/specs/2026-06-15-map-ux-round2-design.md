# 지도 화면 UX 2차 개선 — 3밴드 레이아웃·시트 상세·내 위치·동기화 정합성

- 날짜: 2026-06-15
- 상태: 설계 확정(구현 계획 전)
- 범위: 1차 개편(2026-06-15 map-ux-overhaul) 실사용 피드백 7건 + UX 감사 발굴 중 **CRITICAL·MAJOR + quick wins**. MINOR/NIT은 다음 라운드.

---

## 1. 배경

1차 개편 후 실사용에서 레이아웃·검색흐름·위치·동기화 문제가 드러났다. 7개 사용자 보고 + 7차원 UX 감사(원시 61→정리 50). 이번 라운드는 **막힘(시트가 탭바 가림)·데이터 정합성(LWW·충돌 모순)·첫인상(빈 화면)·접근성 치명**을 우선 해결한다.

핵심 결정 2가지(사용자):
1. **범위 = CRITICAL + MAJOR + 보고 7건 + quick wins.** (MINOR/NIT 연기)
2. **말풍선(InfoWindow)을 React 상세 시트로 교체.** 지도는 순수 시각, 상세·액션은 시트의 React 컴포넌트.

---

## 2. 새 상호작용 모델 (말풍선 → 시트 상세)

지도 위 주입 HTML 말풍선(InfoWindow) 제거. 대신:
- **마커 클릭 / 리스트 카드 탭** → `selectedId` 설정 → 마커 강조(아이콘 교체+zIndex, 기존 유지) + **시트가 half로 올라오며 선택 장소 상세를 React로 표시**(`PlaceDetail` 컴포넌트, 시트 상단 고정 영역). 상세 = 이름·상태(글리프+텍스트)·카테고리/지역 + 액션(가봤어요 토글 · ❤️ 리액션). **길찾기 없음**(#5).
- **검색 결과 탭(미저장)** → `previewHit` 설정 → 지도에 프리뷰 마커 + **시트에 프리뷰 상세(이름·카테고리·주소 + [저장])**. 저장 시 일반 장소로 전환.
- **닫기** → 상세 영역 닫힘(선택 해제). 지도 빈 곳 클릭/ESC/시트 상세의 닫기 버튼.
- 제거: `infoWindowHtml`·`previewWindowHtml`(주입 HTML 빌더), `NaverMap`의 InfoWindow 효과/위임 핸들러/`infoRef`·`previewInfoRef` 일체. `directionsUrl`/`openDirections`는 미사용 → 제거(또는 보존만, 호출부 제거).
- 이점: 진짜 React 버튼 → 포커스/키보드/aria-live/Dynamic Type 자연 해결, Naver 로고 오탭(#7) 원천 소멸, 상태관리 단순.

---

## 3. 작업 영역 (CRITICAL=🔴 / MAJOR=🟠)

### 3.1 하단 3밴드 레이아웃 (지도 / 시트 / 탭바)
- 🔴 **시트가 탭바를 덮음**: `.sheet`를 `bottom: calc(var(--tabbar-h) + var(--safe-bottom))`로 앵커하고, `translateYFor`/peek 계산에서 탭바 높이를 제외해 **peek가 탭바 위에 앉게** 한다. 탭바는 `position: relative; z-index: 46`로 시트보다 위. (미사용 `--tabbar-h` 토큰 활용.)
- 🟠 **dvh(CSS) vs innerHeight(JS) 불일치**(로고 겹침·버튼 드리프트·흰 틈의 공통 뿌리): 단일 소스로 통일 — JS가 측정한 뷰포트 높이로 `--app-vh`를 설정하고, 시트 translateY·지도 인셋·플로팅 버튼 위치를 **모두 같은 값**에서 도출. peek 밴드는 **콘텐츠 기반 고정 px**(예: `calc(112px + var(--safe-bottom))`)로 두고 half/full만 비율.
- 🟠 **full 확장 시 백드롭 없음**: 지도 화면 시트는 **half를 최대**로(또는 full 시 fade 백드롭 z-index 44 + 탭하면 collapse). 검색 오버레이는 snap>peek면 시트 헤더로 접거나 가림 방지.
- 🟠 **`touch-action:none`이 리스트 스크롤 삼킴**: `.handleBtn`에만 `touch-action:none`, `.body`는 `pan-y`. body 최상단에서 아래로 끌면 collapse(스크롤 위치 인지 드래그).
- 🟠 **Naver 로고/축척이 시트와 겹침**: 3밴드 정렬 + dvh 통일로 seam 제거. 추가로 액션이 지도에서 사라지므로(시트로 이동) 오탭 위험 소멸. 로고는 ToS상 표시 유지(지도 바닥, peek 위 가시 영역).
- 🟠 **내 위치 버튼이 펼치면 시트 밑으로 숨음**: snap>peek면 버튼 숨기거나 시트 상단 따라가게. 위치 토스트는 전역 `Toast`(z-index 60)로.

### 3.2 검색·저장 흐름
- 🔴 **결과 탭해도 목록이 안 닫혀 프리뷰를 가림**: `onPick` 시 `clear()` + 입력 blur(키보드 닫힘) → 프리뷰/지도 즉시 노출. 저장 성공 후에도 결과 비움(연속 저장 대비).
- 🟠 **저장 성공→선택 레이스**(마커 미존재로 상세 사라짐): `useSavePlace`에 `onMutate` 낙관적 insert(키 kakaoPlaceId) 또는 저장 성공 시 refetch 대기 후 select. 온라인 저장 성공 토스트('저장했어요').
- 🟠 **jumped 무피드백 + 프리뷰 중 상대가 저장**: `r.jumped`면 '이미 담긴 곳이에요' 토스트; `previewHit.kakaoPlaceId`가 `savedKakaoIds`에 들어오면 프리뷰→선택 자동 전환.
- 🟠 **dedup 키에 좌표 없음**: `name|roadAddress|round(lat,4)|round(lng,4)`로 키 보정(같은 건물 다른 가게 구분, 지번/도로명 변형 흡수) + vitest 케이스 2종.

### 3.3 빈 / 에러 상태
- 🔴 **안내가 peek 아래에 숨어 첫 화면이 죽어 보임**: `places.length===0` 또는 `!coupleActive` 또는 로딩이면 **마운트 시 시트 half 자동 오픈**(selectedId 효과 패턴). peek 요약을 로딩 시 '불러오는 중…'으로(‘0곳’ 금지). peek 헤더에 한 줄 CTA.
- 🟠 **키 없을 때 빈상태 2개 중복**: `isNaverMapConfigured()` false면 `PlaceSheet` 미렌더(단일 '준비 중' 메시지).
- 🟠 **텍스트-only CTA**: 0건→검색 입력 포커스 액션, 미연결→`/us` 링크 액션 버튼(EmptyState `action`).

### 3.4 동기화 정합성 (룰 §4.3/§5.5)
- 🔴 **가봤음 취소 충돌 모순**: `useUnmarkVisited`가 `{conflicted:boolean}` 반환 → 호출부는 `!conflicted`일 때만 성공 토스트. 카드/(시트 상세) 동일 피드백.
- 🔴 **리액션 취소 LWW(version 없음)**: un-react를 `softDelete('reactions', id, version, myId)` 경로로(조회 시 id+version 확보) — version 단조 증가·soft-delete 계약 일치.
- 🟠 **방문/리액션 오프라인 큐 없음(유실)**: visit.add / visit.remove / reaction.toggle을 오프라인 시 큐 적재(savePlace의 `offlineExecutor` 패턴) 또는 최소한 offline 에러 캐치 후 '오프라인이라 기록 못 했어요' 토스트. (이번 라운드: **큐 적재 우선**, 불가 시 캐치+토스트.)
- 🟠 **중복 방문 insert**: `useMarkVisited`는 이미 방문이면 no-op(가드). 액션 pending 중 재진입 무시.

### 3.5 내 위치
- 🟠 **내 위치 점·정확도원 없음**(#1): `GeoResult`에 accuracy 추가, 마지막 위치를 state로 보관, **전용 self-dot 마커 + 반투명 `naver.maps.Circle`(반경=accuracy)** 렌더. recenter/초기 시 갱신.
- 🟠 **로드 시 자동 권한요청(룰 위반)**: 마운트 시 자동 `getCurrentPosition` 금지. 초기엔 저장장소 fitBounds(없으면 서울). 위치는 **📍 탭에서만** 요청(또는 `navigator.permissions.query`가 granted일 때만 조용히 자동). 
- 🟠 **geo 성공이 places fitBounds 안 함 + 늦은 성공이 뷰포트 가로챔**: 성공 시 저장장소 있으면 self+places로 fitBounds(핀 있으면 zoom14 강제 안 함). 첫 사용자 dragend/zoom에서 `userMovedRef`=true → 늦은 자동 setCenter 스킵.
- 🟠 **📍 피드백·디바운스 없음**: `isLocating` state(스피너/aria-busy/비활성), 동시 호출 방지.
- 🟠 **거부 시 복구 경로 없음**: 영구 인라인 안내 + 액션(timeout→재시도, denied→iOS 설정 안내), `window.isSecureContext` 거짓이면 'insecure' 별도 메시지.

### 3.6 말풍선 액션(→ 시트 상세) · 마커
- #5 길찾기 제거(상세·프리뷰 모두), #6 가봤어요 토글 직관화(React 토글: 채움/빈 체크 + 눌림 상태, '다녀왔어요'=액션/'가봤음'=상태 일관) — **3.2 모델로 자연 해결**.
- 🟠 **가짜 disabled 제거**: 기존 `.actionDone` opacity/cursor·허위 주석 제거(시트 상세에선 정상 토글).
- 🟠 **마커 모양 구분 약함**: 가봤음에 **체크(✓) 배지/구분 글리프** 추가해 ☆/★가 색만이 아닌 실루엣으로 구분(♥는 둘 다 찜 유지).

### 3.7 접근성 (시트 상세 전환으로 다수 자동 해결)
- 🔴 **다크모드 success/danger 대비 미달**: `@media(prefers-color-scheme:dark)`에 `--c-success`/`--c-danger` 오버라이드 추가(AA≥4.5:1 검증).
- 🔴 **말풍선 키보드/SR 도달 불가** → 시트 상세(React)로 해결: 선택 시 상세에 포커스 이동, ESC/닫기, aria-live로 선택 안내.
- 🟠 Dynamic Type: 시트 상세는 래핑 허용(고정 박스 금지) — React라 자연 충족.
- 🟠 `PlaceSheet` role: 항상 보이는 패널이므로 `role="region"`(complementary) + `aria-label`, 핸들에 `aria-expanded`. (modal 아님.)

---

## 4. 컴포넌트 / 파일 맵 (주요)
- `src/styles/tokens.css` — 다크 success/danger, `--app-vh`/peek 고정 px 정리.
- `src/components/places/PlaceSheet.tsx`(+css) — bottom 앵커(탭바 위), 3밴드, touch-action 분리, backdrop/half-cap, role=region, 상세/프리뷰 호스팅, 빈상태 자동 half, peek 요약 로딩.
- `src/components/places/PlaceDetail.tsx`(신규,+css) — 선택 장소 상세(상태·가봤어요 토글·❤️) React.
- `src/components/places/PlacePreviewDetail.tsx`(신규,+css) — 미저장 후보 프리뷰(저장).
- `src/components/places/PlaceList.tsx` — 가봤음 undo 버튼 44px·정상 토글, 마커/배지 정합.
- `src/components/places/PlaceSearch.tsx`(+css) — onPick 시 clear+blur, 연속검색.
- `src/components/map/NaverMap.tsx`(+css) — InfoWindow 일체 제거, self-dot+accuracy circle, 자동권한 제거·userMovedRef·fitBounds(self+places), 📍 isLocating, 마커 체크 글리프, 로고/축척 seam 정리. 선택은 onSelect만(상세는 시트).
- `src/pages/MapPage.tsx` — 모델 재배선(선택→시트 상세, 프리뷰→시트), 저장 레이스/ jumped, 키없을때 시트 미렌더, 위치 토스트 전역화.
- `src/hooks/useVisits.ts` — useUnmarkVisited `{conflicted}` 반환, useMarkVisited 방문 가드, (오프라인 큐), ['places'] 무효화 제거.
- `src/hooks/useReactions.ts` — un-react softDelete(version).
- `src/lib/geo/currentPosition.ts` — accuracy·isSecureContext·highAccuracy(명시 탭).
- `src/lib/places/savePlace.ts` — dedup 키 좌표 포함.
- `src/hooks/useSavePlace.ts` / `state/offlineExecutor.ts` — 낙관적 insert, visit/reaction 큐 경로.
- `src/app/AppLayout.module.css` / `TabBar.module.css` — 탭바 z-index 46.
- 제거: `infoWindowHtml.ts`/`previewWindowHtml`(또는 빈 stub), 관련 테스트 대체. `directionsUrl` 호출부 제거.

---

## 5. 비주얼 하베스 (사용자 요청 "직접 보면서") — 구현 0단계
- `e2e/`(또는 별도) Playwright 하베스: `page.route`로 Supabase auth/REST 목 + `addInitScript`로 `window.naver` 스텁(지도 타일 없이 우리 DOM 렌더) + 세션 시드 → **인증·커플 연결된 지도 화면**에 도달.
- 시나리오 스냅샷: 빈 상태(0곳)·장소 N개·선택 상세·검색 프리뷰·시트 peek/half·라이트/다크·작은/큰 화면.
- 구현 중 이 스냅샷으로 3밴드/겹침/상세를 **눈으로 확인·회귀**. (spec §7 후속이던 항목을 이번에 구축.)
- Naver 주입 DOM(로고)은 스텁이라 미재현 → 로고 seam은 3밴드 기하로 코드 보장 + 수동 1회 확인.

---

## 6. 단계 (plan에서 상세)
- **P0** 비주얼 하베스 + 베이스라인 스냅샷
- **P1** 3밴드 레이아웃(탭바 앵커·dvh 통일·touch-action·backdrop/half-cap·버튼/토스트)
- **P2** 말풍선→시트 상세(PlaceDetail/PreviewDetail, InfoWindow 제거, 길찾기 제거, 가봤어요 토글)
- **P3** 빈/에러 상태(자동 half·로딩 요약·CTA·키없을때 시트 미렌더)
- **P4** 동기화 정합성(unvisit conflicted·un-react softDelete·visit 가드·['places'] 무효화 제거·오프라인 큐)
- **P5** 내 위치(self-dot+accuracy·자동권한 제거·fitBounds·isLocating·거부복구)
- **P6** 검색 흐름(저장 레이스·jumped·dedup 키) + 마커 체크 글리프 + 다크 대비 토큰
- **P7** 최종 게이트 + 스냅샷 회귀

## 7. 테스트 게이트
- 순수/단위: dedup 키(좌표) 2종, currentPosition(accuracy/insecure), unvisit conflicted 분기, clusterPlaces 유지.
- 컴포넌트: PlaceDetail(토글·❤️·닫기·포커스), PlacePreviewDetail(저장), PlaceSheet(탭바 미가림 위치·자동 half·role=region·키없을때 미렌더), PlaceSearch(onPick clear+blur).
- 비주얼: Playwright 하베스 스냅샷(빈/선택/프리뷰/peek·half/라·다).
- 동기화: unvisit 충돌 토스트 억제, un-react version, 오프라인 큐.
- `tsc`/`vitest`/`build`/`e2e` green.

## 8. 편차 / 연기
- 편차: 지도 말풍선 폐지(시트 상세) — 초기 "마커 위 말풍선" 설계를 접근성/오탭 이유로 변경(사용자 결정). 설계서/이전 spec와의 차이 기록.
- 연기(다음 라운드, MINOR/NIT): 가로모드 side-sheet, 마커 키보드 포커스, 작은폰 peek 클립 미세조정, 버튼 가중치 재배치, 검색 로딩 스켈레톤, 클러스터 다크 대비, ❤️/우선순위 라벨 분리, 재방문 다건 원자성 등.
