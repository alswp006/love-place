# 지도 화면 UX 개편 — 풀블리드·검색 프리뷰·내 위치·가봤어요 토글 외

- 날짜: 2026-06-15
- 상태: 설계 확정(구현 계획 전)
- 범위: 통합 지도 화면(2026-06-14 통합)의 사용자 피드백 반영 — 레이아웃·검색 흐름·위치·방문 토글·섹션 정리 + 발굴된 UX 개선 3건

---

## 1. 배경 / 목적

2026-06-14에 지도+장소를 한 화면으로 통합한 뒤 실사용 피드백이 들어왔다. 핵심은 "지도가 더 지도앱답게(풀블리드·내 위치·네이버식 검색 프리뷰), 시트는 더 가볍게(불필요한 섹션·출처·타이틀 제거), 동작은 더 직관적으로(가봤어요 토글)".

**비목적(이번 범위 밖)**
- 날짜+여행 다단계 방문 흐름(현행 토글 유지).
- 사진 앨범/기록 화면(여행 섹션은 숨김만, 삭제 아님).
- 위치 정보의 상대 공유(내 화면 중심일 뿐; §10.3 위치 상호 동의와 별개).
- 위치 권한 거부 후 재요청 심화 안내·오프라인 검색 전용 화면(§9 후속).

---

## 2. 확정 결정

| 항목 | 결정 |
|---|---|
| 앱 시작 지도 중심 | 내 위치 중심 + '내 위치' 버튼. 실패/거부 시 저장장소 fitBounds → 서울 폴백 |
| 휴지통·여행 | 시트에서 제거 — 휴지통은 '우리' 탭으로 이동(복구 유지), 여행 섹션은 숨김(코드 보존) |
| TodayCard(지도) | 지도 화면에서 제거 |
| 상단 타이틀/부제 | 지도 화면에서 제거(풀블리드) |
| 출처 아바타 | 장소 카드·말풍선에서 제거(캘린더는 유지) |
| 가봤어요 | 토글(다시 누르면 방문 취소, soft-delete + 낙관적 락) |
| 검색 결과 탭 | 즉시 저장 폐기 → 하이라이트 + 프리뷰 말풍선에서 저장 |
| 검색 결과 already-saved | 작은 아이콘 표시(kakaoPlaceId 대조) |
| 추가 UX(이번 포함) | 마커 클러스터링 · 검색결과 높이/스크롤+빈상태 · 시트 드래그/스크롤/safe-area |

---

## 3. 작업 영역

### 3.1 풀블리드 지도 + 컨트롤 정리 (P1)
- `ScreenScaffold`에 `fullBleed?: boolean` 추가: true면 `<header>`(타이틀/부제)와 본문 패딩을 생략하고 `data-testid`는 유지(라우팅 테스트 `page-map` 보존). 기존 호출부는 영향 없음(옵션 디폴트 false).
- `MapPage`: `ScreenScaffold`를 `fullBleed`로, `TodayCard` 제거.
- 지도 풀블리드: `mapWrap`/지도 컨테이너를 화면을 채우되 **하단을 시트 peek 높이만큼 인셋**(공유 CSS 변수 `--sheet-peek-h`)해서 Naver 로고·축척이 peek 시트 바로 위에 보이게 한다(현재 컨트롤이 상단으로 밀려 보이던 버그 해소). 시트가 half/full로 확장되면 지도를 덮는 오버레이(의도).
- `NaverMap` 지도 옵션: `scaleControl: true` 명시(축척 표시), `logoControl: true` 유지(ToS). 위치는 기본(하단) 유지하되 위 인셋으로 가려지지 않게 함.
- safe-area: 시트·하단 탭바·플로팅 버튼에 `env(safe-area-inset-bottom)` 반영.

### 3.2 출처 아바타 제거 (P2)
- `PlaceList`: `SourceAvatar` import/사용 제거. `profiles` prop이 더는 안 쓰이면 제거하고 `MapPage`의 전달도 정리.
- `infoWindowHtml`: `avatarHtml` 호출 제거. 결과적으로 안 쓰이면 `avatarHtml`/`profiles` 인자 정리(시그니처 변경 시 호출부 `NaverMap` 동기화).
- `SourceAvatar` 컴포넌트 자체는 유지(`CalendarPage` 사용).
- 편차: ux §2 "모든 공유 항목 출처 표시"에서 장소만 예외(사용자 결정). spec에 명시.

### 3.3 가봤어요 토글 (P3)
- `useUnmarkVisited(coupleId, myId)` 신설: 해당 `place_id`의 active(`deleted_at IS NULL`) 방문 행을 soft-delete(`deleted_at` 채움), `version` 조건부(낙관적 락). 여러 행이면 모두 처리. 성공 시 `['visits', coupleId]`·`['places', coupleId]` invalidate(기존 패턴).
- 카드(`PlaceList`)·말풍선(`infoWindowHtml`) 버튼: 가봤음이면 "✅ 가봤음(취소)" 토글로 렌더(현재의 disabled 대신). 탭 → `onAction('unvisit'|'visit')`.
- `MapPage.onAction`: `visit`은 미방문일 때 mark, 방문 상태면 `unvisit`로 분기. 충돌 시 `ConflictBanner`(PlaceSheet의 `useConflict` 경로 재사용).

### 3.4 휴지통·여행 정리 (P4)
- `PlaceSheet`에서 `TrashSection`·`TripsSection` 렌더 제거(여행은 코드 보존, 시트에서만 숨김).
- 휴지통: `UsPage`('우리' 탭)에 `TrashSection` + `useTrashPlaces`/`useRestorePlace` 이전(복구 UI 유지). `PlaceSheet`는 trash 관련 상태/훅 제거.
- `PlaceSheet` 단순화: 검색은 이미 오버레이(별개), 본문 = 필터 + `PlaceList`만.

### 3.5 내 위치 중심 + 버튼 (P5)
- `NaverMap` 초기 센터링 리팩터: 매 `places` 변경마다 `fitBounds` 하던 동작 제거. 대신 **ready 직후 1회**: geolocation 시도 → 성공 시 내 위치로 `setCenter`+zoom(예: 14). 실패/거부/미지원 시 저장장소 있으면 `fitBounds`, 없으면 서울 기본. 이후 마커 변경은 아이콘/추가만(센터 유지).
- '내 위치' 버튼: 지도 우하단 플로팅(peek 위, safe-area 반영). 탭 → 현재 위치 재요청 후 `panTo`. 거부/실패면 토스트 안내(최소 폴백).
- geolocation은 순수 래퍼 `lib/geo/currentPosition.ts`(Promise, 타임아웃·에러 정규화)로 분리(테스트 용이).
- 프라이버시: 맥락 요청(지도 화면), 거부해도 동작(폴백). 내 화면 중심일 뿐 상대에게 위치 전송 없음.

### 3.6 검색 개편 (P6)
- **already-saved 표시**: `MapPage`가 저장된 `kakao_place_id` Set을 만들어 `MapSearchOverlay`→`PlaceSearch`로 전달. 결과 항목이 저장됨이면 작은 배지/아이콘(예: ★ + "저장됨" 라벨, 색+모양 이중화 §8).
- **결과 탭 흐름 변경**: `onPick`에서 즉시 저장하지 않는다.
  - 이미 저장된 곳이면 → `onSelect(existingPlaceId)`(기존 마커 강조 + 말풍선). 검색 패널은 접음.
  - 미저장이면 → `onPreview(hit)`: `MapPage`의 `previewHit` 상태 설정. `NaverMap`이 프리뷰 마커(구분되는 모양)와 프리뷰 말풍선(이름·카테고리·주소 + `[저장]`·`[길찾기]`)을 띄우고 그 위치로 이동.
- **저장**: 프리뷰 말풍선 `[저장]` → `useSavePlace`로 생성 → 성공 시 `previewHit` 해제 + 새 place의 `selectedId` 설정(일반 마커로 전환, realtime/invalidate로 목록 반영). 오프라인이면 기존 큐 메시지.
- `NaverMap` 확장: 단일 InfoWindow를 saved(selectedId)와 preview(previewHit) 두 소스로 구동(동시 표시 안 함; preview 우선). 프리뷰 마커는 1개 transient marker로 관리/정리.
- ≤3탭 보존: 검색 입력 → 결과 탭(프리뷰) → 저장 = 3탭.
- 검색 결과 패널 max-height + 내부 스크롤(지도/시트 가림 방지). 결과 0건/로딩/에러 상태 유지.

### 3.7 마커 클러스터링 (P7)
- 네이버 MarkerClustering 샘플(룰 §5에 포함 언급)로 저장 마커 클러스터링. 줌 레벨에 따라 그룹/개별. 선택 강조·클릭(onSelect)은 개별 마커에서 유지.
- 프리뷰 마커는 클러스터 대상 제외(transient).
- 클러스터 아이콘도 색+개수 텍스트 이중화(§8).

---

## 4. 컴포넌트 / 파일 맵

- `src/components/common/ScreenScaffold.tsx` (+css) — `fullBleed` variant.
- `src/pages/MapPage.tsx` — 풀블리드, TodayCard 제거, `previewHit`/`onPreview`/`onPickSearchResult`/방문 토글/내위치 오케스트레이션, 저장 kakaoId Set.
- `src/pages/MapPage.module.css` — 풀블리드·플로팅 버튼·`--sheet-peek-h`.
- `src/components/map/NaverMap.tsx` (+css) — 초기 센터링 리팩터, 내위치 버튼, 프리뷰 마커/말풍선, 클러스터링, 컨트롤 옵션.
- `src/components/places/PlaceSheet.tsx` (+css) — trash/trips 제거, 본문 단순화.
- `src/components/places/PlaceList.tsx` — 출처 아바타 제거, 가봤어요 토글 버튼.
- `src/components/places/PlaceSearch.tsx` (+css) — already-saved 표시, onPick=프리뷰/선택, 결과 max-height/scroll.
- `src/components/places/MapSearchOverlay.tsx` — savedKakaoIds/onPick 전달.
- `src/lib/places/infoWindowHtml.ts` — 아바타 제거, 방문 토글 라벨, 프리뷰용 빌더(또는 별도 `previewWindowHtml`).
- `src/pages/UsPage.tsx` — 휴지통 섹션 이전.
- `src/hooks/useVisits.ts` — `useUnmarkVisited` 추가.
- `src/lib/geo/currentPosition.ts` (신규, 순수 래퍼) + 테스트.
- `src/lib/naver/markerCluster.ts`(또는 로더) — 클러스터링 유틸.

---

## 5. 단계별 구현 (plan에서 상세)

각 단계가 게이트(tsc/test/build, 해당 시 e2e) 통과.
- **P1** 풀블리드 + ScreenScaffold variant + 컨트롤/세이프에어리어 + TodayCard·타이틀 제거
- **P2** 출처 아바타 제거(카드·말풍선)
- **P3** 가봤어요 토글(useUnmarkVisited + 와이어링)
- **P4** 휴지통→'우리' 탭, 여행 시트에서 숨김
- **P5** 내 위치 중심 + 버튼(geolocation 래퍼 + 센터링 리팩터)
- **P6** 검색 already-saved 표시 + 결과 스크롤/빈상태 + 프리뷰 마커/말풍선 저장 흐름
- **P7** 마커 클러스터링

---

## 6. 테스트 게이트

- 순수함수: `currentPosition`(에러/타임아웃 정규화), 저장 kakaoId 대조, 방문 토글 분기. 기존 순수 테스트 유지.
- 컴포넌트: `PlaceList` 가봤어요 토글, `PlaceSearch` already-saved 표시 + 프리뷰 onPick(즉시저장 안 함), `PlaceSheet` trash/trips 미렌더, `ScreenScaffold` fullBleed(헤더 없음·testId 유지).
- 라우팅: `UsPage` 휴지통 렌더, `page-map` 유지.
- RLS/동기화: 방문 soft-delete 낙관적 락 충돌 표시, realtime.
- Playwright: **인증 화면(/auth)만** — 키 없는 e2e 빌드는 로그인되지 않아 `/`가 `/auth`로 리다이렉트되고 인증 후 지도 화면에 도달할 수 없다(시드/인증 하베스가 이번 범위 밖). 따라서 **풀블리드 지도 + 시트 peek/full + 검색 오버레이 빈상태(라이트/다크) 스모크는 후속으로 연기**하고, 그 검증은 vitest의 MapPage 마운트(`mapPagePreview.test.tsx`, 인증/커플 mocking)와 수동 점검(plan Task 21)으로 대체한다. `npm run e2e`는 인증 화면 스모크만 green 유지(변경 없음). — **편차로 §7에 기록**.
- `tsc`/`vitest`/`build` green.

---

## 7. 접근성 / 편차 / 후속

- 색+모양 이중화 유지(마커 글리프, already-saved 배지, 클러스터 개수, 방문 토글 텍스트).
- reduce-motion: 클러스터/센터 이동·시트 스냅 애니 존중.
- safe-area: 풀블리드 하단 요소 전반.
- **편차**: (a) 장소 출처 아바타 제거(ux §2), (b) 지도 자동 fitBounds → 내 위치 우선(설계서 §5.5 첫 화면 의도 보강), (c) 클러스터링은 "네이버 MarkerClustering 샘플"(web-stack §5) 대신 순수 그리드 클러스터러(타입·테스트 가능), (d) **인증 후 지도 화면의 Playwright 스모크는 e2e에서 도달 불가(§6) → vitest MapPage 마운트 + 수동 점검으로 대체, 지도 e2e 캡처는 후속 연기**. spec에 기록.
- **후속(이번 제외)**: 위치 권한 거부 후 재요청 심화 안내, 오프라인 검색 전용 안내, 재방문 다건 기록(현재 토글은 0/1 의미), **Playwright 인증/커플 시드 하베스 + 풀블리드 지도/시트/검색 오버레이 비주얼 스모크(라이트/다크)**.
