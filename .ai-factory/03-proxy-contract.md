# Supabase Edge Functions — 프록시 계약 (proxy-contract)

> 근거: 설계서 §2.1(공통 백엔드 레이어 — 인증·레이트리밋·상한·캐싱), §5.6(추천 & AI 경로 운영 계약), §6(외부 연동 요약), §10.1(키·엔드포인트 보호). 스택은 확정 B안 = Supabase Edge Functions(Deno). **API 키는 클라이언트 절대 금지 — 전부 이 프록시 경유.**

이 문서는 4개 Edge Function의 **구현 계약**이다. 각 함수는 (1) Supabase JWT 인증 → (2) 커플 멤버십 확인 → (3) 레이트리밋 → (4) 월 비용/사용량 상한 → (5) 캐시 조회 → (6) 외부 호출 → (7) 캐시 기록 순서로 동작한다.

---

## 0. 공통 규약 (모든 엔드포인트)

### 0.1 위치·런타임
- 경로: `supabase/functions/<fn>/index.ts` (Deno). 함수: `kakao-search`, `route-eta`, `ai-itinerary`, `blog-publish`.
- 지연 민감(`kakao-search`)은 가벼운 동기, 장시간(`ai-itinerary`)은 충분한 실행시간 한도 함수로 분리(설계서 §2.1-5 런타임 선택).

### 0.2 인증 (§2.1-1, §10.1)
- 모든 요청은 `Authorization: Bearer <supabase_jwt>` 필수. 프록시가 Supabase JWT 검증 → `auth.uid()` 추출.
- `couples`에서 `user_a = uid OR user_b = uid` 이고 `status='ACTIVE'`인 행 조회 → `couple_id` 확정. 없으면 거절. **요청 본문의 couple_id를 신뢰하지 않고 JWT에서 도출**(스푸핑 차단).
- 단말 검증(App Attest 등)은 웹앱 범위에서 생략(설계서 §2.1-3 '선택').

### 0.3 표준 에러 응답
```ts
type ProxyError = {
  ok: false;
  code: 'UNAUTHENTICATED' | 'NOT_COUPLE_MEMBER' | 'RATE_LIMITED'
      | 'QUOTA_EXCEEDED' | 'BAD_REQUEST' | 'UPSTREAM_ERROR'
      | 'VALIDATION_FAILED' | 'TIMEOUT';
  message: string;          // 사용자 친화 한국어 (상한 초과 시 친절히 거절, §2.1-2)
  retryAfterSec?: number;   // RATE_LIMITED / QUOTA_EXCEEDED
};
```
- HTTP 매핑: 401/403/429/402(quota)/400/502/422/504. 성공은 항상 `{ ok: true, ... }`.

### 0.4 레이트리밋 (§2.1-2)
- 키 = `couple_id`(개인 단위 아님 — 둘이 공유 쿼터). 슬라이딩 윈도우. Postgres 테이블 `proxy_rate_limit(couple_id, fn, window_start, count)` 또는 Deno KV.
- 초과 시 `RATE_LIMITED` + `retryAfterSec`. 한도는 §각 함수 표 참조.

### 0.5 월 비용/사용량 상한 (§2.1-2, §9.2 TCO)
- 테이블 `proxy_usage(couple_id, fn, year_month, call_count, token_in, token_out, est_cost_usd)`. 호출 직후 증분.
- 함수별 월 상한 도달 시 `QUOTA_EXCEEDED`(특히 Claude — 과금 폭탄 차단, §2.1). 상한은 환경변수 `MONTHLY_CAP_<FN>`.

### 0.6 캐싱 (§2.1-4)
- 테이블 `proxy_cache(cache_key TEXT PRIMARY KEY, fn, payload JSONB, created_at, expires_at)`. `cache_key = fn + ':' + sha256(정규화 입력)`.
- 조회 시 `expires_at > now()`면 캐시 히트(외부 호출·과금 스킵). TTL은 §각 함수.

---

## (a) `kakao-search` — 네이버 지역검색 프록시 — D5; 함수명은 배포 경로 호환 유지

근거 §5.2, §6. 클라이언트가 자동완성 입력을 디바운스 후 호출. **네이버 지역검색 API**를 인증 헤더 `X-Naver-Client-Id: <CLIENT_ID>` / `X-Naver-Client-Secret: <CLIENT_SECRET>`로 호출한다. (D5: 장소 검색 정본=네이버. 함수명 `kakao-search`·타입 이름은 배포 경로·클라이언트 결합 호환을 위해 그대로 유지하고 의미만 네이버로 해석.)

### 요청
```ts
// POST /functions/v1/kakao-search
type KakaoSearchReq = {
  query: string;          // 검색어(trim, 1~50자). 빈 문자열 거절(BAD_REQUEST)
  x?: number;             // 중심 경도(lng) — 거리순 정렬용(선택)
  y?: number;             // 중심 위도(lat)
  page?: number;          // 1~3 (기본 1)
  size?: number;          // 1~15 (기본 15)
};
```

### 응답
```ts
type KakaoPlaceHit = {     // 타입 이름 유지(클라 결합) — 의미는 네이버 지역검색 결과
  kakaoPlaceId: string;   // 네이버는 고유 ID 없음 → norm(stripTags(title))|norm(roadAddress||address) 합성키 — UNIQUE per couple 키 (normalize.ts)
  name: string;           // title(<b> 태그 제거 후)
  address: string;        // roadAddress || address(지번)
  lat: number;            // mapy / 1e7 (위도, WGS84)
  lng: number;            // mapx / 1e7 (경도, WGS84)
  category: string;       // category
  placeUrl: string;       // link
  phone?: string;         // telephone
};
type KakaoSearchRes = {
  ok: true;
  hits: KakaoPlaceHit[];
  isEnd: boolean;         // meta.is_end (더보기 가능 여부)
  cached: boolean;
};
```
- **영업시간 필드 없음** — 네이버 지역검색은 영업시간을 반환하지 않는다(§5.6 환각 차단의 근원). 절대 추가하지 않는다.
- 결과 0건도 `ok:true, hits:[]` — 클라이언트가 "직접 입력" 폴백 처리(§5.2 엣지케이스).

### 디바운스·캐시·한도
- **디바운스 250ms는 클라이언트 책임**(§5.2). stale 응답은 클라이언트 취소 토큰으로 무시(서버 무관).
- **캐시 TTL: 60초**(짧은 TTL, §2.1-4 "자동완성은 짧은 TTL"). `cache_key = sha256(query|x반올림3|y반올림3|page|size)`.
- 레이트리밋: **분당 30 / 일 600** (couple 단위). 자동완성 특성상 분당 한도가 핵심.
- 월 상한: 네이버 지역검색 일 한도 내라 별도 비용 상한 없음(`call_count`만 집계, §9.2).

---

## (b) `route-eta` — 길찾기/이동시간 (카카오모빌리티 / TMap)

근거 §5.6 "실제 이동시간". **순서 고정 후 인접 구간 N−1회만 단방향**(O(N²)·순환 의존 회피). 대표 소요시간 캐시.

### 요청
```ts
// POST /functions/v1/route-eta
type RouteLeg = { fromPlaceId: string; from: LatLng; to: LatLng };
type LatLng = { lat: number; lng: number };
type RouteEtaReq = {
  legs: RouteLeg[];       // 인접 구간 목록 = stops N개면 N-1개. 최대 20
  mode?: 'CAR';           // 1차 자동차만. 도보/대중교통은 추후
  provider?: 'KAKAO' | 'TMAP'; // 기본 KAKAO(카카오모빌리티), 실패 시 TMAP 폴백
};
```

### 응답
```ts
type RouteEtaLeg = {
  fromPlaceId: string;
  durationSec: number;    // 구간 소요(초)
  distanceM: number;      // 구간 거리(m)
  polyline?: LatLng[];    // 동선 폴리라인 좌표(지도 표시용, §5.6 루프 닫기)
};
type RouteEtaRes = {
  ok: true;
  legs: RouteEtaLeg[];    // 입력 legs와 1:1 순서 보존
  provider: 'KAKAO' | 'TMAP';
  cached: boolean;
};
```
- 인접 구간만 받으므로 N개 stop → **정확히 N−1회** 호출(클라이언트가 leg 배열로 분해해 1요청, 프록시가 내부에서 구간별 upstream 호출).
- upstream 실패 시 KAKAO→TMAP 폴백. 둘 다 실패면 해당 leg `durationSec` 직선거리 추정값 + `degraded:true` 플래그(상위 AI 폴백과 연동).

### 캐시·한도
- **캐시 TTL: 24시간**(대표 소요시간 캐시, §5.6). `cache_key = sha256(provider|mode|from좌표5|to좌표5)` — leg 단위 캐싱(코스가 달라도 같은 구간 재사용).
- 레이트리밋: **분당 20 / 일 200** (couple). leg 합산 기준.
- 월 상한: 카카오모빌리티 일 1만/ TMap 일 1천 한도 내라 비용 상한 없음, `call_count` 집계.

---

## (c) `ai-itinerary` — AI 경로 생성 (Anthropic Claude)

근거 §5.6 운영 계약 전체. **구조화 출력 강제 → zod 검증 → 1회 재시도 → stop_reason 가드 → 화이트리스트 → 영업시간 금지 → 결정론 후처리 → 폴백.**

### 요청
```ts
// POST /functions/v1/ai-itinerary
type ItineraryPlaceInput = {
  placeId: string;        // 화이트리스트 키 (우리 DB place id)
  name: string;
  lat: number; lng: number;
  category: string;
  // 영업시간 없음 — 보내지 않는다(출처 없는 시간은 AI 입력에 금지, §5.6)
};
type ItineraryConstraints = {
  startDate: string;      // YYYY-MM-DD
  endDate: string;
  partySize: 2;           // 고정(2인 앱)
  transport: 'CAR' | 'TRANSIT' | 'WALK';
  pace: 'RELAXED' | 'PACKED';
  preferences?: string[]; // 예: ["맛집 위주","카페 많이"]
};
type AiItineraryReq = {
  places: ItineraryPlaceInput[];   // 2~20개
  constraints: ItineraryConstraints;
  pinnedStops?: { day: number; placeId: string }[]; // 부분 재생성 시 고정(§5.6 편집 UX)
  regenerate?: boolean;            // true면 pinned 유지하고 나머지만 재생성
};
```

### 출력 (Claude structured outputs — strict json_schema)
```ts
type ItineraryStop = {
  placeId: string;        // 반드시 입력 places[].placeId 집합 내 (화이트리스트)
  stayMinutes: number;    // 체류분
  travelNote?: string;    // 이동메모
  reason: string;         // 추천이유
  // 도착시각(arrivalTime)은 AI가 주더라도 신뢰하지 않고 프록시가 재계산
};
type ItineraryDay = {
  date: string;           // YYYY-MM-DD
  stops: ItineraryStop[];
};
type AiItineraryRes = {
  ok: true;
  days: ItineraryDay[];                 // 결정론 후처리로 arrivalTime 주입된 최종본
  source: 'AI' | 'FALLBACK';            // 폴백 여부 명시
  businessHoursDisclaimer: true;        // 항상 "영업시간 미반영" 면책(§5.6)
  cached: boolean;
};
```
실제 `days[].stops[]`에는 후처리로 `arrivalTime`(ISO)이 채워진다. zod 스키마는 입력(모델 응답)에서는 arrivalTime을 받지 않거나 무시한다.

### 운영 계약 (구현 순서 — §5.6)
1. **구조화 출력 강제** — Anthropic API에 `response_format`/tool use `strict: true` + json_schema(days→stops). 시스템 프롬프트에 **"영업시간을 추정·생성하지 말 것"** 명시.
2. **stop_reason 가드** — 응답 `stop_reason !== 'end_turn'`(예: `max_tokens`, `refusal`)이면 실패 처리.
3. **zod 검증** — 응답 JSON을 zod 스키마로 파싱. 실패 시 **1회 재시도**(같은 입력, 검증 에러를 프롬프트에 첨부). 재시도도 실패면 폴백.
4. **화이트리스트 검증** — 모든 `stop.placeId`가 입력 `places[].placeId` 집합에 있어야 채택. 환각 장소 1개라도 있으면 → 폴백(또는 해당 stop 제거 후 재검증). `VALIDATION_FAILED` 사유 기록.
5. **결정론 후처리(앱이 재계산)** — `arrivalTime[i] = arrivalTime[i-1] + stayMinutes[i-1] + legDuration(i-1→i)`. 구간 이동시간은 `route-eta`(b) 결과 사용. **AI 산술 신뢰 금지.** 첫 stop은 그날 시작시각(기본 09:00, constraints로 조정).
6. **영업시간** — 출력에 영업시간 필드 없음. `businessHoursDisclaimer: true` 항상. 출처 생기기 전까지 코스에 "영업시간 미반영" 표시.
7. **폴백(`source:'FALLBACK'`)** — 타임아웃/5xx/콜드스타트/검증 실패 시: **좌표 기준 최근접(TSP 근사) 순서 + 카테고리 기반 끼니 슬롯**(점심/저녁 식당 category 배치). 최소한 순서·끼니는 보장(§5.6).

### 모델·캐시·한도 (비용 핵심)
- 모델: Claude(설계서 §6). 토큰 단가 × 호출 수로 비용 집계(`token_in`/`token_out` 기록, §9.2 TCO).
- **캐시 TTL: 7일**. `cache_key = sha256(정렬된 placeIds | constraints | pinnedStops)` — 동일 장소셋·제약이면 결과 재사용(§2.1-4 비용·지연 절감). `regenerate:true`는 캐시 우회.
- 레이트리밋: **분당 3 / 일 20** (couple). 무거운 호출.
- **월 비용 상한(핵심)**: `MONTHLY_CAP_AI_ITINERARY`(예: 월 100회 또는 $X). 도달 시 `QUOTA_EXCEEDED`로 친절히 거절(과금 폭탄 차단, §2.1-2). 폴백은 비용 0이므로 상한 후에도 `source:'FALLBACK'` 제공 가능(선택).

---

## (d) `blog-publish` — 블로그 발행 (가공본 생성 · EXIF 스트립)

근거 §7, §10.1. **원본 사진 복사 → EXIF/GPS 스트립 → 리사이즈 → 공개 경로 재업로드 → 가공본 URL만 페이로드에.** 비공개 기본, 명시적 공개 동의 후 호출.

### 요청
```ts
// POST /functions/v1/blog-publish
type BlogPublishReq = {
  placeId?: string;       // 또는 tripId — 발행 대상
  tripId?: string;
  region: string;         // 표시 지역명
  dates: string[];        // YYYY-MM-DD[]
  memo?: string;
  photoIds: string[];     // 우리 DB photo id (couple 소유 검증)
  carrier: 'WEBHOOK' | 'GITHUB_DRAFT' | 'SHARE_SHEET'; // 운반책 택1(§7)
  consent: true;          // 공개 동의 다이얼로그 확인값. 없으면 BAD_REQUEST(§10.3)
};
```

### 응답 (고정 페이로드 스키마 — §7)
```ts
type PublishedPhoto = {
  url: string;            // EXIF 제거된 발행용 가공본 공개 URL (원본/서명URL 아님)
  caption?: string;
  takenAt?: string;       // 날짜 단위만(시:분 제거 가능) — 동선 추론 방지
};
type BlogPayload = {       // 운반책과 무관한 고정 계약
  place: string;
  region: string;
  dates: string[];
  coordinates: { lat: number; lng: number }; // 장소 대표 좌표(사진 GPS 아님)
  memo?: string;
  mapUrl?: string;
  photos: PublishedPhoto[];
};
type BlogPublishRes = {
  ok: true;
  payload: BlogPayload;
  delivered: boolean;     // 운반책으로 실제 전송 성공 여부
  carrier: BlogPublishReq['carrier'];
};
```

### 발행 파이프라인 (§7, §10.1)
1. `photoIds` 전부 같은 `couple_id` 소유 검증(아니면 거절).
2. 각 사진: 원본 다운로드(Storage) → **EXIF/GPS 메타데이터 완전 스트립** → 리사이즈(긴 변 ~1600px) → **공개 버킷에 새 파일로 업로드**. 원본·비공개 서명 URL은 페이로드에 절대 넣지 않는다(만료/공개 붕괴 방지, §7).
3. `coordinates`는 사진 EXIF가 아니라 **PLACE 대표 좌표** 사용(집·동선 노출 방지).
4. `takenAt`은 날짜 단위로 축소(시각 제거 권장).
5. 운반책별 전송:
   - `WEBHOOK`: `POST <BLOG_IMPORT_URL>` with `BlogPayload`.
   - `GITHUB_DRAFT`: 프론트매터 + 가공본 이미지를 `_drafts/`/PR로 GitHub API push. **GitHub 토큰은 프록시 보관**, 자동 발행 금지(사람 확인), ASCII 슬러그 파일명.
   - `SHARE_SHEET`: 전송 안 하고 `payload`만 반환(클라이언트가 iOS 공유 시트로 처리, §7 MVP 1순위). `delivered:false`.

### 캐시·한도
- **캐싱 없음** — 발행은 멱등 아님, 매번 새 가공본 생성. (단 동일 사진 재가공은 가공본 URL 재사용 가능 — `proxy_cache`에 photoId→가공URL 매핑 선택적.)
- 레이트리밋: **분당 5 / 일 30** (couple).
- 월 상한: Storage 쓰기 비용만 — `call_count`/업로드 바이트 집계(§9.2 사진=비용 주동인).

---

## 부록: 한도·캐시 요약표

| 함수 | 캐시 TTL | 레이트리밋(couple) | 월 비용 상한 | 비고 |
|---|---|---|---|---|
| `kakao-search` | 60초 | 분 30 / 일 600 | 없음(집계만) | 디바운스는 클라이언트 |
| `route-eta` | 24시간 | 분 20 / 일 200 | 없음(집계만) | leg 단위 캐시, KAKAO→TMAP 폴백 |
| `ai-itinerary` | 7일 | 분 3 / 일 20 | **있음(필수)** | strict json_schema·화이트리스트·폴백 |
| `blog-publish` | 없음 | 분 5 / 일 30 | Storage 집계 | EXIF 스트립·동의 필수 |

> 모든 수치는 2인 규모 초기값. `proxy_usage`로 실측 후 환경변수로 조정. 상한 초과는 항상 친절한 한국어 거절(§2.1-2).
