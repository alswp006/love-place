# 통합 "지도" 화면 — 지도 + 드래그 시트(장소 통합) + 마커 클릭 말풍선

- 날짜: 2026-06-14
- 상태: 설계 확정(구현 계획 전)
- 범위: 지도 탭과 장소 탭을 네이버식 단일 화면으로 통합 + 마커 클릭 시 강조·정보 말풍선

---

## 1. 배경 / 목적

지도 탭(`/`)과 장소 탭(`/places`)은 **같은 `places` 데이터**를 공간(지도)과 리스트(관리)로 보여줄 뿐 역할이 크게 겹친다. 네이버지도·구글맵처럼 "지도 + 하단 리스트 시트"를 한 화면으로 합치면 중복 내비게이션이 사라지고, 본래 요청이었던 **마커 클릭 → 강조 + 정보 표시**가 통합 화면의 자연스러운 일부가 된다.

**목적**
- 지도 마커를 클릭하면 그 마커가 강조되고 장소 정보 말풍선(InfoWindow)이 뜬다.
- 지도·리스트를 한 화면(드래그 하단 시트)에서 다룬다. 하단 탭 5→4.

**비목적(이번 범위 밖)**
- 날짜+여행 선택 다단계 "가봤어요" 흐름(현행 원탭 유지).
- 이모지 여러 종 리액션(❤️ 하나만).
- 네이버 기본 베이스맵 POI(우리가 저장 안 한 가게 아이콘) 클릭 — JS SDK 미지원.
- 전용 장소 상세 라우트(`/places/:placeId`) 신설.

---

## 2. 설계서 편차(명시)

설계서 §3 IA는 **5탭(지도/일정/장소/추천/우리)을 정본**으로 못박았고 CLAUDE.md는 "설계서와 모순 금지"를 규정한다. 본 설계는 사용자 결정에 따라 **장소 탭을 지도 탭에 통합(5→4)** 한다 — 소스 오브 트루스 변경이다.

- 근거: 두 탭이 같은 데이터를 다뤄 중복, "마찰 최소화"(§1) 가치에 부합, 네이버 감성 근사(§8).
- 후속: 구현 완료 후 설계서 §3 본문 갱신 여부를 사용자에게 확인(별도 결정).

---

## 3. 확정 결정 사항

| 항목 | 결정 |
|---|---|
| 클릭 대상 | 우리가 저장한 장소 마커(☆/♥/★)만 |
| 정보 표시 형태 | 마커 위 말풍선(네이버 `InfoWindow`) |
| 말풍선 액션 | 🧭 외부 길찾기 · ✅ 가봤어요 · ❤️ 리액션 |
| 화면 레이아웃 | 드래그 하단 시트(peek/half/full 스냅) |
| 여행·휴지통 위치 | 시트 full 상태 하단에 유지 |
| 가봤어요 | 원탭(오늘 날짜 방문 1건 insert) — 현행 동일 |
| ❤️ 리액션 | ❤️ 하나 토글(켜기=insert, 끄기=soft-delete) |

---

## 4. IA / 라우팅

- 하단 탭 4개: **지도 · 일정 · 추천 · 우리**. `장소` 탭 제거.
- `/` = 통합 "지도" 화면.
- `/places` → `/` 리다이렉트(북마크/딥링크 보존).
- `src/app/tabs.ts` 갱신:
  - `장소` TabDef 제거.
  - **`/places`로 향하던 CTA를 전부 `/`로 변경**: 지도(`action.to`)·일정(`action.to`)·추천(`action.to`) 빈 상태 액션, 그리고 지도 탭 `empty.hint`/`subtitle` 문구("장소 탭에서…" → 통합 화면 문구).
  - 라우터·`TabBar`가 `TABS`에서 도출되므로 한 곳 수정으로 동기화(기존 설계 유지).

---

## 5. 컴포넌트 구조

데이터 접근은 `hooks/`에 격리하고 화면 컴포넌트는 표현/상호작용에 집중한다(web-stack §2).

- **`MapPage`(오케스트레이터)** — 훅들(`usePlaces/useWishes/useVisits/useReactions/useCouple` + realtime)을 묶고, 지도·시트가 공유하는 `selectedId` 상태를 보유. `NaverMap`·`PlaceSheet`에 데이터/핸들러 전달.
- **`NaverMap`** — 지도 + 마커 + 선택 강조 + 말풍선(InfoWindow). 마커 클릭 → `onSelect(placeId)`. `selectedId`를 prop으로 받아 강조/말풍선 동기화.
- **`PlaceSheet`(신규)** — 드래그 하단 시트. 스냅 3단(peek/half/full). 핸들 드래그 **+ 핸들 탭 버튼 대체**(제스처 발견성↓ 보완, ux §1). 구성:
  - peek: 핸들 + 요약("우리 장소 N곳") + 필터 칩(전체/가고싶음/가봤음)
  - half·full: 검색 결과/필터 + `PlaceList` + `TripsSection` + 휴지통 섹션
- **`PlaceList`(신규, PlacesPage에서 추출)** — 장소 카드 리스트. 카드 = 이름·주소·`WishBadge`·`PriorityStepper`·가봤어요 버튼·`SourceAvatar`·지역 배지·삭제. 카드 탭 → `onSelect(placeId)`.
- **검색바** — 지도 위 상단 오버레이로 `PlaceSearch` 이전. **위시 저장 ≤3탭 유지**(검색 입력→후보 탭→저장).
- **제거** — `PlacesPage`(로직은 위 컴포넌트로 흡수). `PlacesPage.module.css`의 카드/리스트 스타일은 `PlaceList`로 이전.

---

## 6. 상호작용: 지도 ↔ 리스트 ↔ 말풍선

`selectedId`(MapPage 보유)가 단일 진실원.

- **마커 클릭** → `selectedId` 설정 → (a) 마커 강조(아이콘 교체: 확대+링/그림자, z-index↑), (b) InfoWindow 열림, (c) 시트가 해당 카드로 스크롤+하이라이트. 시트가 peek면 half로 살짝 올림.
- **리스트 카드 탭** → `selectedId` 설정 → 지도가 해당 마커로 `panTo` + 강조 + InfoWindow 열림.
- **닫기**(말풍선 X / 지도 빈 곳 클릭 / ESC) → `selectedId = null` → 강조 해제, InfoWindow close.
- 강조/스냅 애니메이션은 `prefers-reduced-motion: reduce`면 즉시 전환(ux §5).

### 마커 강조 구현 주의
- 마커를 `Map<placeId, marker>`로 보관. `selectedId` 변경 시 **해당 마커들의 아이콘만 교체**하고 전체 재드로우·`fitBounds`를 다시 돌리지 않는다(깜빡임/지도 튐 방지). `fitBounds`는 `places` 변경 시에만.

---

## 7. 말풍선(InfoWindow)

네이버 `InfoWindow`는 HTML 문자열 콘텐츠를 받는다.

- **내용**: 이름 + 상태 글리프(☆ 가고싶음 / ♥ 둘 다 찜 / ★ 가봤음) + 카테고리·지역 + 추가자 아바타(출처, ux §2) + 닫기(✕) + 액션 3개 `[🧭 길찾기] [✅ 가봤어요] [❤️]`.
- **상태/소유자는 색+모양 이중화**(글리프·텍스트 병행, §8).
- **액션 이벤트**: InfoWindow는 React 핸들러를 직접 못 붙이므로, 콘텐츠 버튼에 `data-action`을 부여하고 **열린 뒤 콘텐츠 노드에 위임 클릭 리스너**(단일)로 처리. `selectedId`/리액션/방문 상태가 바뀌면 콘텐츠 문자열을 다시 만들어 `setContent` 후 재바인딩.
- **❤️ 상태**: 내가 누른 상태면 채워진 하트(❤️), 아니면 빈 하트(🤍)로 렌더(토글 반영). 리액션 **총 개수**가 1 이상이면 하트 옆에 숫자를 함께 표시(§3 "총 개수"). 0개면 숫자 숨김.
- **✅ 가봤어요 상태**: 이미 가봤음이면 가봤어요 액션을 비활성 "가봤음" 상태로 렌더(누를 수 없게 — 원탭 1건 의도 유지, 중복 방문 insert 방지).

---

## 8. 새 데이터 훅 / 유틸

- **`useReactions(coupleId)` + `useToggleReaction`** (`src/hooks/useReactions.ts`)
  - 조회: `reactions`에서 `target_type='PLACE'`, `deleted_at IS NULL` 행을 place별로 집계(내가 눌렀는지 + 총 개수).
  - 토글: 내 ❤️ 없으면 insert(`emoji='❤️'`, `couple_id/user_id/created_by/updated_by`), 있으면 **`deleted_at` soft-delete**(물리삭제 금지, rule §4). 재토글은 새 행 insert.
  - Realtime: `reactions` 채널 구독 → 관련 쿼리 invalidate(상대 반응 즉시 전파, web-stack §4.3). 쿼리 키 `['reactions', coupleId]`.
  - RLS: 0009에서 reactions RLS 수정됨 — 커플 격리 전제. 별도 마이그레이션 불필요(테스트로 확인).
- **`useMarkVisited` 재사용**(이미 존재) — 버블/리스트 "가봤어요" 원탭.
- **`lib/places/directionsUrl.ts`(순수 함수)** — 좌표+이름 → 네이버 길찾기 딥링크. 앱 스킴(`nmap://route/public?dlat=&dlng=&dname=&appname=…`) + 웹 폴백(`https://map.naver.com/…`). 키·백엔드 불필요. **정확한 파라미터/스킴은 실기기에서 verify**(아래 §11 열린 항목).
- **시트 스냅 상태** — 작은 순수 로직(스냅 단계 전이: peek↔half↔full)을 테스트 가능한 유틸/훅으로 분리.

---

## 9. 빈 상태 / 로딩 / 에러 (필수)

- 장소 0개: 시트에 "첫 가고싶은 장소를 추가해보세요" + 검색 유도(다층 빈 상태, ux §7). 죽은 화면 금지.
- 지도 로드 실패/미설정: 기존 `NaverMap` fallback 유지.
- 리스트 로딩: `Skeleton`.
- 리액션/방문/삭제 실패: 기존 `toast`로 인라인 안내, 충돌은 invalidate로 최신화.

---

## 10. 접근성

- 시트: 핸들에 `role`/`aria-label`, **드래그 제스처엔 항상 탭 버튼 대체**(단계 전환), 포커스 관리, reduce-motion 시 스냅 애니 생략.
- 말풍선: `role="dialog"` + `aria-label`, 닫기 `aria-label`, ESC 닫기(EventSheet 패턴 재사용).
- 색+모양 이중화 유지(마커 글리프, 배지 텍스트, §8).
- Dynamic Type/다크모드: 색 토큰 CSS 변수, 시트/말풍선 모두 대비 AA.

---

## 11. 단계별 구현 계획(spec → plan에서 상세화)

각 단계가 게이트(tsc/vitest/build/Playwright) 통과.

- **P-A. IA/라우팅 + 통합 골격** — `tabs.ts` 4탭화, `/places`→`/` 리다이렉트, CTA 경로 갱신, `MapPage`에 `selectedId` 골격.
- **P-B. 드래그 시트 + 리스트 이전** — `PlaceSheet`·`PlaceList` 신설, `PlacesPage` 로직(검색·필터·우선순위·가봤어요·여행·휴지통) 이전, 검색바 지도 위 오버레이화. `PlacesPage` 제거.
- **P-C. 마커 클릭 말풍선 + 연동** — `NaverMap` 선택 강조·InfoWindow, 지도↔리스트↔말풍선 `selectedId` 동기화.
- **P-D. 리액션 / 길찾기** — `useReactions`/`useToggleReaction`, `directionsUrl`, 말풍선 액션 와이어링.

---

## 12. 테스트 게이트

- 순수함수: `directionsUrl`(좌표/이름 인코딩·폴백), 리액션 토글 로직, 시트 스냅 전이. (기존 `markerVisual` 유지.)
- RLS: `reactions` PLACE insert/select/soft-delete 커플 동작 + 타 커플 격리(`rls.integration.test`에 케이스 보강).
- 동기화/충돌/오프라인 횡단(P1+ 규칙): 리액션·방문 realtime 전파, 충돌 invalidate.
- Playwright 비주얼 스모크: 통합 화면 — 지도+시트 peek/full, 빈 상태, 라이트/다크, 마커 클릭 말풍선. `/places` 리다이렉트 동작.
- `tsc --noEmit` 0, `vitest`, `vite build` 통과.

---

## 13. 열린 항목(구현 중 확정)

- 네이버 길찾기 딥링크의 정확한 스킴/파라미터(앱 스킴 vs 웹 URL) — 실기기(모바일 Safari)에서 동작 확인 후 고정.
- 시트 스냅 비율(peek/half/full %)과 제스처 임계값 — 구현 중 모바일 뷰포트 기준 조정.
- 마커 강조 비주얼(확대 배율·링 색) — 디자인 토큰과 맞춰 미세 조정.
