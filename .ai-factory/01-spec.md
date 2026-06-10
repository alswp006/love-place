# love_place — 구현 스펙 (Implementation Spec)

> 소스 오브 트루스: `여행관리앱_설계서.md`. 이 문서는 설계서 §5(기능별 상세)를 **테스트 가능한 AC**로 증류한 구현 계약이다.
> 스택은 확정: **웹앱(React+Vite+TS / PWA) + Supabase(B안) + Edge Functions 프록시**. 설계서의 A안(CloudKit/SwiftUI)·RN/Expo 분기는 본 프로젝트에 적용하지 않는다.
> 각 AC는 **행위(무엇을)** 와 **레이아웃/표현 계약(어떻게 — `data-testid` 포함)** 을 동급으로 명시한다. `[비협상]` 표시는 협상 불가 항목.
> 화면 = 하단 탭바 5개: 지도 / 일정 / 장소 / 추천 / 우리 (설계서 §3).

---

## 0. 공통 표현 계약 (모든 화면 적용)

- **탭바**: `data-testid="tabbar"`, 탭 버튼 `tabbar-tab-{map|schedule|places|recommend|us}`. 활성 탭 `aria-current="page"`.
- **출처 아바타** (설계서 §8): 모든 항목(장소/사진/방문/이벤트)에 추가/편집자 아바타. `data-testid="origin-avatar"`, `aria-label="{displayName}이(가) 추가"`. 색만으로 구분 금지 — 아바타+라벨 병기.
- **빈 상태** (설계서 §8 다층 빈 상태): `data-testid="empty-state-{screen}"`, 친근 문구 + CTA. `role="status"`.
- **로딩**: 스켈레톤 `data-testid="skeleton-{screen}"`. 즉시 스피너로 덮지 않고 다층(스켈레톤 → 부분 데이터 → 완료).
- **충돌 배지** (설계서 §4.3 낙관적 락): 버전 충돌 시 `data-testid="conflict-banner"`, "상대가 먼저 수정했어요" + 병합/덮어쓰기 선택. **무음 LWW 금지** `[비협상]`.
- **오프라인 표시** (설계서 §4.3): 쓰기 큐 대기 중 `data-testid="offline-queue-badge"` (대기 건수 표시). 재연결 시 자동 동기화.
- **soft-delete**: 삭제는 `deleted_at`만 채움. 휴지통 `data-testid="trash-tray"`에서 복구 가능.
- **접근성** (설계서 §8): 상태는 **색 + 패턴/라벨 이중화** `[비협상]`. VoiceOver 라벨, Dynamic Type, Reduce Motion(`prefers-reduced-motion` 시 모션 제거), 다크모드 기본.
- **API 키**: 클라이언트에 절대 노출 금지 — 네이버/Claude/길찾기 호출 전부 Edge Function 프록시 경유 `[비협상]` (설계서 §2.1, §10.1).

---

## 1. 지도 (Map) — 설계서 §5.5

### 1.1 마커 표시
- **행위**: 커플의 모든 `places`를 네이버 지도 JS SDK(v3)에 마커로 표시. 가고싶음(=해당 place에 `wishes` 존재) / 가봤음(=`visits` 존재)을 도출값으로 구분. (지도 표시=네이버, 장소 검색=네이버 지역검색으로 정본 확정 — D5.)
- **표현**: 컨테이너 `data-testid="map-canvas"`. 마커 `data-testid="map-marker-{placeId}"`.
  - 가고싶음 = **빈 별** + `aria-label="가고싶음: {name}"`.
  - 가봤음 = **채운 별 + 체크 아이콘** + `aria-label="가봤음: {name}"`.
  - 색만이 아니라 **모양(빈/채움)+체크 패턴**으로 구분 `[비협상]`.
- **AC**: wish만 있는 장소 → 빈 별. visit≥1 → 채운 별+체크. 둘 다 있어도 visit 우선(가봤고 또 가고싶음 표현은 상세에서). 0건이면 `empty-state-map` ("첫 가고싶은 장소를 추가해보세요").

### 1.2 클러스터링 / 출처 / 필터
- **행위**: 줌아웃 시 클러스터링(네이버 지도 MarkerClustering 샘플 포함 — SDK 번들 아님). 마커 탭 → 미니 카드(이름·사진 1장·상태) → 상세 진입. 상단 필터 "가고싶은/가본/전체" 토글. 추가자 아바타 점 출처 표시.
- **표현**: 클러스터 `data-testid="map-cluster"` (포함 개수 텍스트 표기). 미니카드 `data-testid="map-minicard-{placeId}"`. 필터 `data-testid="map-filter-{want|visited|all}"`, 활성 시 `aria-pressed="true"`. 출처 점 `data-testid="map-marker-origin-{placeId}"`.
- **AC**: 필터=가본 → wish전용 마커 숨김. 클러스터 탭 → 줌인/확장. 미니카드의 "상세" → 장소 상세.

---

## 2. 일정 (Schedule) — 설계서 §5.1, §4.2

### 2.1 3트랙 캘린더 + 색 도출
- **행위**: 월/주/일/아젠다 뷰. 이벤트는 `events`에서 로드. **색은 런타임 도출** — SHARED→퍼플(함께), PERSONAL+내소유→블루(나), PERSONAL+상대소유→핑크(상대). 저장은 `visibility` + `owner_id`만. PERSONAL도 서로 보임(색만 갈림).
- **표현**: 뷰 전환 `data-testid="cal-view-{month|week|day|agenda}"`, 활성 `aria-current`. 이벤트 `data-testid="cal-event-{eventId}"`.
  - 트랙 색 + **라벨/패턴 이중화** `[비협상]`: `data-track="{mine|partner|shared}"` 속성과 텍스트 배지("함께"/소유자 이니셜) 병기 — 색각 이상 대응.
  - 트랙 토글 칩 상단: `data-testid="cal-trackchip-{mine|partner|shared}"`, off 시 `aria-pressed="false"`로 해당 트랙 숨김.
- **AC**: 같은 이벤트가 두 단말에서 동일 트랙 색으로 도출(설계서 §9 DoD "두 단말 색 도출 일치"). 칩 off → 해당 트랙 이벤트 비표시. 3트랙 모두 채워질 수 있음(상대 PERSONAL도 핑크로 보임).

### 2.2 종일 / 반복 / 타임존 `[비협상]`
- **행위**: 종일 이벤트(`is_all_day`)는 상단 종일 배너. 반복은 RRULE(`recurrence_rule`); 특정 회차 수정·삭제는 EXDATE/RECURRENCE-ID 예외 저장. 타임존(`time_zone` IANA)으로 두 사람이 다른 TZ여도 시각 일치. Trip은 여러 날 종일 범위 배너.
- **표현**: 종일 배너 `data-testid="cal-allday-banner"`. 반복 표식 `data-testid="cal-recurrence-icon-{eventId}"` (+`aria-label="반복 일정"`). 회차 예외 편집 시 "이 일정만 / 이후 모두" 선택 `data-testid="cal-recurrence-scope"`.
- **AC**: 종일·반복은 MVP 이후라도 **협상 불가** `[비협상]` (설계서 §5.1). 단일 회차 삭제 → EXDATE 추가, 시리즈 보존. TZ 다른 두 단말이 같은 절대 시각 표시.

### 2.3 이벤트 생성 / 장소 연결 / 리마인더
- **행위**: 길게 눌러 생성(또는 + 버튼). 필드: 제목·시간·종일·타임존·반복·장소 연결(선택)·메모·visibility·participants(OWNER_ONLY|BOTH)·**사용자별 리마인더** `reminders=[{userId, offsetMinutes}]`. 장소 연결 시 지도/장소 탭과 연동.
- **표현**: 생성 폼 `data-testid="event-form"`. 장소 연결 `data-testid="event-place-link"`. 리마인더 행(사용자별) `data-testid="event-reminder-{userId}"`. 저장 `data-testid="event-save"`.
- **AC**: 리마인더는 두 사람이 각자 다른 offset 설정 가능. 장소 연결된 이벤트 → 장소 상세에서 역참조 노출.

---

## 3. 장소 (Places) — 설계서 §5.2, §5.3, §5.4

### 3.1 위시 장소 추가 — 네이버 지역검색 자동완성 `[탭 ≤3]`
- **행위**: 검색 한 줄 입력 → **디바운스 250ms** → Edge 프록시 → 네이버 지역검색 → 드롭다운 후보. (D5: 장소 검색·자동완성 정본 = 네이버 지역검색. 함수명 `kakao-search`는 배포 경로 호환 위해 유지.) 탭 → `places`(공유) + `wishes`(내 의도, priority 하트) 저장. 메모·태그·하트 가볍게 얹음. 주소 파싱으로 `region_code`/`region_label` 자동 채움.
- **표현**: 검색 입력 `data-testid="place-search-input"`. 드롭다운 `data-testid="place-search-results"`, 후보 `place-search-result-{kakaoPlaceId}` (testid 토큰 유지 — 값=네이버 장소ID, 식별자 유지). 저장 후 하트 애니메이션(Reduce Motion 시 생략). 하트 우선순위 `data-testid="wish-priority-{placeId}"`.
- **AC**: 저장 ≤3탭(검색입력은 1탭으로 카운트) `[비협상 목표]` (설계서 §8). 자동완성 체감 ≤400ms (설계서 §9 DoD). 저장 시 `Place`+내 `Wish` 동시 생성.

### 3.2 자동완성 엣지케이스 `[비협상]` (설계서 §5.2 표)
| 상황 | 처리 | 표현 계약 |
|---|---|---|
| 검색 결과 **0건** | "직접 입력" 폴백(이름·주소·핀 찍기) | `data-testid="place-manual-fallback"` (드롭다운 비었을 때 노출) |
| **오프라인/타임아웃** | 인라인 에러 + 재시도, **입력값 보존** | `data-testid="place-search-error"` + 재시도 `place-search-retry`. 입력 텍스트 유지 |
| **중복 저장** (같은 `kakao_place_id`, per couple UNIQUE) | 기존 카드로 **점프**, 내 `Wish`만 추가 (값=네이버 장소ID, 식별자 유지 — D5) | `data-testid="place-duplicate-jump"` → 기존 `place-card-{placeId}` 스크롤/하이라이트 |
| **stale 응답** (디바운스 race) | 요청에 **취소 토큰**, 늦게 온 옛 응답 무시 | 표시된 결과는 항상 최신 입력 대응. (테스트: 빠른 연속 입력 시 옛 응답 미반영) |

### 3.3 위시 목록 + 가본 곳 전환 `[탭 ≤5]`
- **행위**: 가고싶은 장소 목록. 장소 상세에서 "다녀왔어요" → 날짜·여행(Trip) 선택 → `visits` 생성(상태 플래그가 아니라 **기록 추가**). 같은 장소 재방문 시 visit 각각 누적.
- **표현**: 위시 목록 `data-testid="wishlist"`, 카드 `place-card-{placeId}`. 다녀왔어요 버튼 `data-testid="place-mark-visited"`. 방문 폼(날짜·여행·평점·메모) `data-testid="visit-form"`.
- **AC**: 전환 흐름 ≤5탭(설계서 §8). visit 생성 → 지도 마커가 채운별+체크로 갱신(Realtime). 같은 place 두 번 방문 → visit 2건.

### 3.4 가본 장소 보기 — 여행별 / 지역별
- **행위**: **여행별(타임라인)** — 최근 Trip부터 카드(커버 사진·지역·기간·장소 수). **지역별** — `region_code` 그룹핑, 지역 탭 시 해당 지역 방문 시간순.
- **표현**: 보기 토글 `data-testid="visited-view-{trip|region}"`. 여행 카드 `trip-card-{tripId}`. 지역 그룹 헤더 `region-group-{regionCode}`.
- **AC**: Trip 커버 사진 삭제 시 커버 null 폴백(빈 커버 플레이스홀더). 같은 region_code 방문들이 한 그룹에 시간순.

### 3.5 공유 사진 앨범 — EXIF 제안 + 수동 확정 (설계서 §5.4)
- **행위**: Trip/Place에 공유 앨범. 업로드 시 EXIF(촬영시각·`exif_lat/lng`)로 Trip/Place **추정 제안**(자동 확정 금지 `[비협상]`). 사용자가 1탭 수락/변경. 자동배정엔 '자동' 배지. GPS 없음 → 시각으로 Trip만 추정. 못 맞춤 → **미분류(UNCLASSIFIED) 트레이**(정식 상태). 필터 칩(여행/지역/날짜/태그). 그리드는 **썸네일만 지연 로딩**, 원본은 탭 시 로드.
- **표현**: 그리드 `data-testid="photo-grid"`(lazy 썸네일 `loading="lazy"`). 자동 배지 `data-testid="photo-auto-badge-{photoId}"`. 제안 수락/변경 `photo-suggestion-{accept|change}-{photoId}`. 미분류 트레이 `data-testid="unclassified-tray"`. 필터 칩 `photo-filter-{trip|region|date|tag}`.
- **AC**: 자동 분류는 항상 '제안'(배지 부착), 자동 **확정 안 함** `[비협상]`. 1탭 정정 가능(설계서 §9 DoD). 어디에도 못 맞춘 사진 → 미분류 트레이에서 회수 가능.

---

## 4. 추천 (Recommend) — 설계서 §5.6

### 4.1 지역별 추천 트리거 + 콜드스타트
- **행위**: 같은 지역 *가고싶은 장소*가 임계치(3~5) 이상 → 추천 카드("강릉 5곳 모였어요, 코스로?"). 좌표 기준 지역·근접도 클러스터링. 데이터 없으면 **회고형/시드 추천**으로 빈 탭 방지.
- **표현**: 추천 카드 `data-testid="reco-card-{regionCode}"` (장소 수·지역 라벨). 콜드스타트 빈상태 `data-testid="empty-state-recommend"` (회고/시드 카드 `reco-seed-card`). "코스 짜기" CTA `data-testid="reco-build-course"`.
- **AC**: 임계치 미만 → 카드 없음, 회고/시드 노출(죽은 탭 방지). 임계치 도달 → 해당 지역 카드 등장.

### 4.2 AI 경로 생성 — 운영 계약 `[비협상]` (설계서 §5.6)
- **행위**: 장소들 + 제약(날짜·인원2·이동수단·페이스·선호)을 프록시→Claude로. 좌표 TSP 대략 순서 선계산 → Claude가 끼니·휴식·이유 보강.
- **운영 계약** `[비협상]`:
  1. **구조화 출력 강제** — strict `json_schema`/tool use, 프록시에서 zod/ajv 검증, 실패 시 1회 재시도. `stop_reason != end_turn` 가드.
  2. **장소 화이트리스트** — 각 stop의 place_id는 **입력 place_id 집합 안에만**. 밖이면 **거부**(환각 차단).
  3. **영업시간 환각 차단** — AI에 영업시간 추정 **금지**. "영업시간 미반영" 면책 표시.
  4. **결정론적 후처리** — 도착시각 = 직전도착 + 체류분 + 이동시간을 **앱이 재계산**(AI 산술 불신).
  5. **폴백** — 타임아웃/5xx/콜드스타트 시 "좌표 TSP 순서 + 카테고리 끼니 슬롯" 결정론 폴백.
- **이동시간**: 순서 고정 후 인접 N−1구간만 단방향 길찾기(O(N²)·순환 회피), 캐시.
- **표현**: 코스 결과 `data-testid="course-result"`. 각 stop `course-stop-{placeId}` (도착시각·체류분·이동메모·추천이유). 영업시간 면책 `data-testid="course-hours-disclaimer"` `[비협상]`. 폴백 표식 `data-testid="course-fallback-badge"`. 화이트리스트 위반 stop은 렌더되지 않음(거부됨).
- **AC** (설계서 §9 DoD): JSON 스키마 검증 100%, **환각 장소 0**, 폴백 동작. 도착시각은 앱 재계산값. 영업시간 면책 항상 노출.

### 4.3 편집 / 루프 닫기
- **행위**: 코스 = **편집 가능한 초안**. stop 고정(핀)/제거 후 **부분 재생성**. 완성 코스 → ① 지도 폴리라인 ② "함께 캘린더에 추가"(이벤트 자동 생성, `itinerary_id` 출처 보존).
- **표현**: 핀 `data-testid="course-stop-pin-{placeId}"`, 제거 `course-stop-remove-{placeId}`. 부분 재생성 `data-testid="course-regenerate"`. 지도 폴리라인 `data-testid="course-polyline"`. 캘린더 추가 `data-testid="course-to-calendar"`.
- **AC**: 핀 고정한 stop은 재생성 시 유지. 캘린더 추가 → SHARED 이벤트들 생성 + `itinerary_id` 채워짐 → 일정 탭에 퍼플 트랙으로 등장.

---

## 5. 우리 (Us) — 설계서 §3, §4.2, §10

### 5.1 연결 / 초대
- **행위**: 1회용·만료·고엔트로피 초대코드로 1:1 바인딩(제3자/다자 차단). 생성: COUPLE PENDING + 코드 발급 → 수락 시 user_b/`couple_id` 채움 → ACTIVE. 멤버 ≤2 앱 레이어 강제.
- **표현**: 초대 생성 `data-testid="invite-create"` (코드+만료 표시 `invite-code`, `invite-expiry`). 코드 입력 수락 `data-testid="invite-accept-input"`. 연결 상태 배지 `data-testid="couple-status-{pending|active|disconnected}"`.
- **AC**: 만료/사용된 코드 거부. 이미 2인 커플에 3번째 가입 차단. RLS로 다른 커플 데이터 격리(설계서 §9 DoD "RLS 격리 확인").

### 5.2 프로필 / 색상 / 알림
- **행위**: display_name·avatar·트랙 색 설정. 알림: 인앱 활동 피드 1차(iOS 웹푸시 제약 → 설계서 §8). 알림 권한은 **맥락에서** 요청, 거부 시 인앱 피드 폴백.
- **표현**: 프로필 폼 `data-testid="profile-form"`. 색 선택 `profile-color-picker`. 활동 피드 `data-testid="activity-feed"` ("상대가 장소 추가" / "○○ 여행 D-3").
- **AC**: 색 변경 → 캘린더 트랙 색 도출에 반영. 권한 거부해도 활동 피드는 동작.

### 5.3 내보내기 / 연결 해제 (설계서 §10.4) `[비협상: 양측 동등]`
- **행위**: 연결 해제(DISCONNECT) 흐름. 각자 **내보내기**(사진 ZIP + JSON, 양측 **동등** 권리). 해제 시 공유 데이터 사본 정책 명시. 삭제 요청 지원.
- **표현**: 내보내기 `data-testid="export-button"` (ZIP+JSON). 연결 해제 `data-testid="disconnect-button"` (확인 다이얼로그 `disconnect-confirm`).
- **AC**: 내보내기는 두 사용자 모두 동일하게 가능 `[비협상]`. 해제 후 status=DISCONNECTED, 데이터 사본 정책대로 처리.

### 5.4 blog auto writer 연동 (설계서 §7) `[비협상: EXIF 스트립]`
- **행위**: 발행은 **명시적 공개**. 발행 시 원본 사진 **복사 → EXIF/GPS 스트립 → 리사이즈 → 공개 경로 재업로드**, 페이로드엔 **가공본 URL만**. 비공개 기본. 고정 페이로드 스키마(§7). 운반책 택1(REST/Webhook | Jekyll 초안 푸시 | iOS 공유시트). GitHub 토큰도 프록시 경유.
- **표현**: 발행 버튼 `data-testid="blog-publish"` (공개 동의 다이얼로그 `blog-consent-dialog`). 가공본 미리보기 `data-testid="blog-processed-preview"`.
- **AC** (설계서 §9 DoD): 발행 사진 **EXIF 제거 검증** `[비협상]`. 페이로드 photos[].url = 가공본(원본 비공개 URL 아님). 동의 다이얼로그 없이는 발행 불가.

---

## 6. 횡단 테스트 게이트 (설계서 §9.2, 코딩 규약)

- **게이트**: `tsc` 0 에러, `vitest` 통과, `build` 성공, Playwright 비주얼 스모크 통과.
- **동기화/충돌/오프라인** 테스트는 P1부터 (설계서 §9.2): ① Realtime 약전파 유실 0 ② version 충돌 감지(LWW 금지) ③ 오프라인 쓰기 큐→재연결 동기화.
- **비용/보안**: 프록시 레이트리밋·월 상한 동작, RLS 전 테이블 격리, EXIF 스트립을 각 단계 체크.
