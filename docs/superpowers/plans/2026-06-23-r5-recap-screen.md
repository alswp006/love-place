# R5 P-B/P-C/P-D — 여행 리캡 화면 Implementation Plan

> REQUIRED SUB-SKILL: executing-plans(인라인). 각 조각 TDD/구현 → 게이트 → 커밋 → push(증분).
> 전제: R5 spec 승인(2026-06-21-r5-capacitor-recap-design.md). P-A/P-A.5 완료. **read-side, 새 테이블 0.**

**Goal:** 여행(trip)의 방문 장소(visits)를 순서대로 이은 **측지선 동선 + 3-스탯 + 정거장 목록 + 기기 내 공유 카드** 리캡 화면.

**실제 빌딩블록 한계(정직):** 사진 훅 없음(사진 피처 미구현) · reactions는 PLACE 전용(VISIT 없음) → **MVP에서 사진/정거장별 리액션 제외**(해당 피처 생기면 후속). NaverMap 폴리라인 없음 → 추가. 라우트/진입 없음 → 추가.

## 조각
### P-B1 — 도출(순수) + 훅
- `src/lib/recap/recapStats.ts`: `haversineKm(a,b)`, `orderedVertices(visits, placesById)`(trip 방문을 visit_date 오름차 정렬 + place 조인 → 순서 정점 [{visitId,placeId,name,lat,lng,visitDate,regionLabel}], 좌표 없는 건 제외), `recapStats(vertices, trip)`(→ {stopCount, distanceKm(인접 haversine 합), days(start~end+1)}).
- `src/hooks/useTripRecap.ts`: `useTrips`+`useVisits`+`usePlaces`(coupleId) 재사용 → tripId로 trip 찾고 visits(trip_id 일치) place 조인 → {trip, vertices, stats, isLoading}.
- 테스트: recapStats(거리/스탯/정렬/좌표누락), useTripRecap 도출.

### P-B2 — NaverMap 폴리라인
- `NaverMap`에 `polyline?: {lat:number;lng:number}[]` prop 추가 → naver `Polyline`(정점 통과, strokeColor 마시멜로 `#e2638a`, weight 4) 그리는 effect(+ 변경/언마운트 정리). 기존 마커 로직 불변.
- `e2e/harness/naverStub.ts`에 `Polyline`(setMap/setPath/setOptions) 추가(테스트/e2e map init throw 방지).
- 테스트: naverStub 기반 폴리라인 렌더(있으면).

### P-B3 — RecapPage + 라우트
- `src/pages/RecapPage.tsx`(lazy): `/trips/:tripId/recap`. useTripRecap → RecapView. 로딩 스켈레톤·빈 상태("이 여행엔 동선이 없어요")·trip 없음.
- RecapView: 헤더(제목·기간·뒤로) + NaverMap(places=정점, polyline=정점) + **3-스탯 칩**(장소 N · 거리 ~km(장소→장소) · N일) + **순서 정거장 목록**(번호·이름·날짜·지역) + 공유 버튼(P-C). 마시멜로 프리미티브.
- `src/app/router.tsx`: AppLayout children에 `{ path: 'trips/:tripId/recap', element: lazyRoute(<RecapPage/>) }`.
- 테스트: 라우트 렌더, 스탯/정거장 표시, 빈/로딩.

### P-B4 — 진입(추천 탭 회고)
- `RecommendPage`에 "지난 여행 리캡" 섹션: `useTrips` 목록 → 각 trip을 `/trips/:tripId/recap`로 CtaLink(Card). 여행 0이면 섹션 숨김(기존 SEED/빈상태 보존).
- 테스트: 여행 있을 때 리캡 링크 노출.

### P-C — 공유 카드
- `src/lib/recap/shareCard.ts`: `drawRecapCard(ctx, {title, stats, vertices})`(마시멜로 배경·제목·단순화 동선 스케치·스탯 텍스트, 스토리 비율), `shareRecapBlob(blob, filename)`(navigator.share files 지원 시 공유, 아니면 다운로드 폴백).
- RecapView "공유" → offscreen canvas draw → toBlob → shareRecapBlob. **서버/공개 링크 없음**(spec §share=기기 내 PNG).
- 테스트: drawRecapCard가 ctx API 호출(canvas 모킹), shareRecapBlob 분기(share vs download).

### P-D — 폴리시 + 게이트
- reduce-motion·다크·a11y(스탯/목록 색+텍스트), 빈/로딩/에러. e2e 스냅샷(있으면) 재생성. 전 게이트.

## 게이트(증분마다)
tsc0 / vitest(recapStats·useTripRecap·recapPage·shareCard 신규) / build / e2e. 기능 read-side(N/A RLS/EXIF). 
## 정직성
사진·정거장 리액션은 해당 피처 미구현으로 제외(후속). 도로 스냅 아님(측지선, spec). 실기기 색감·공유 시트는 육안 남음.
