# R5 — Capacitor 패키징 + 여행 동선/리캡 MVP (설계)

- 날짜: 2026-06-21
- 상태: 설계(사용자 결정 패널 완료, 리뷰 대기)
- 포지셔닝(확정): **"추억 + 리캡 공유"** — 우리가 함께 만든 동선을 *나중에 같이 다시 보는* 것. 실시간 위치/감시 아님(Life360·Polarsteps live의 반대).
- 근거: R5 사전 조사(코드베이스 통합·네이티브 위치·한국 위치정보법·경쟁사 recap 4-렌즈 → 합성).

## 0. 한 줄 요지
**기록이 아니라 리캡을 먼저 출시한다.** 이미 쌓인 `visits`(여행에 연결된 방문 장소)로 동선·통계·사진 recap을 만든다 → 새 권한 0, 한국 LBS 사업 신고 0, 그런데 체감 가치의 ~90%. 실제 GPS 브레드크럼은 **게이트된 후속 에픽(R6)** 으로 분리.

## 1. 사용자 결정(패널) — 확정
| # | 결정 | 선택 |
|---|---|---|
| 1 | Recap 소스 | **방문 곡선만 (지금)** + GPS 브레드크럼은 R6로 보류·설계만 |
| 2 | 네이티브 패키징 | **지금 Capacitor 래핑** (GPS와 엄격 분리) |
| 3 | 공유 범위 | **기기 내 PNG만** (canvas→OS 공유 시트, 서버·공개 링크 없음) |
| 4 | 동선 선 | **직선/측지선** ('장소→장소 거리' 표기). 도로 스냅은 후속 옵션(폴리라인 소스만 교체 — 데이터 모델 불변) |

## 2. 범위

### IN (R5 MVP)
- **Capacitor 패키징**(iOS+Android): 빌드된 `dist` 번들 래핑, SW는 브라우저 전용으로 게이트, 매직링크는 네이티브에서 **6자리 OTP 우선**(WebView PKCE 함정 회피) + appUrlOpen 폴백.
- **여행 리캡 화면**(read-side): 한 여행의 방문 장소를 순서대로 이은 **측지선 폴리라인**(지도) + **3-스탯**(방문 장소 수 / 장소→장소 haversine 합 거리 / 기간) + **장소별 미니카드**(출처 아바타 + ❤️ 리액션, `reactions.target_type=VISIT` 재사용) + **장소에 핀된 사진**.
- **공유 카드**: canvas로 스토리 비율 PNG 1장 렌더(정적 지도 썸네일 + 커버 사진 + 스탯) → `navigator.share`/OS 공유 시트(웹은 다운로드 폴백).
- 빈 상태/로딩/에러(다층, §UX), reduce-motion·다크·a11y(색+텍스트 이중화).

### OUT (R5에서 안 함 — 명시)
- ❌ 백그라운드 GPS 기록, `watchPosition`/Always-location, `trip_tracks`/`location_points` 테이블.
- ❌ 위치기반서비스사업 신고 / 제3자 제공 동의 / 앱스토어 백그라운드 위치 declaration.
- ❌ 공개 웹 링크, 호스팅 recap 페이지.
- ❌ 도로 스냅 라우팅(후속 옵션).
- ❌ 자동 여행 시작 감지, 지오펜싱, 소셜 피드.

## 3. 아키텍처

### 3.1 Capacitor 트랙(GPS와 분리)
- `@capacitor/core` + `ios`/`android` 플랫폼 추가, `capacitor.config`에 앱 ID/이름, `webDir=dist`.
- 빌드: 기존 `vite build` 산출물을 그대로 번들(서버 호스팅 불필요, 로컬 자산).
- 인증: `isNativePlatform()`이면 매직링크 클릭 대신 **OTP 코드 입력 경로 우선**(이미 R3에서 OTP 경로 존재) — WebView에서 링크가 시스템 브라우저로 열리며 PKCE verifier 유실되는 함정 회피. 폴백으로 `appUrlOpen` + `exchangeCodeForSession`.
- PWA SW: `vite-plugin-pwa`를 브라우저 전용으로 게이트(`!Capacitor.isNativePlatform()`)해 네이티브 WebView와 충돌 방지.
- **백그라운드 위치 plugin·권한 일절 추가하지 않음** → 앱스토어 심사에서 백그라운드 위치 정당화 불필요(순수 다운사이드 회피).

### 3.2 리캡 트랙(read-side, 새 테이블 0)
- `useTripRecap(tripId)` 훅: 
  - `trips`(제목 + start_date/end_date → 기간 도출, 새 컬럼 없음, `cover_photo_id`).
  - `visits WHERE trip_id=:id AND deleted_at IS NULL ORDER BY visit_date, created_at` → `places(lat,lng,name,region_label)` 조인 = **순서 있는 정점**.
  - 장소별 사진(`photos` 기존), 리액션(`reactions target_type=VISIT`).
- **거리 도출**: 인접 정점 간 haversine 합(클라이언트 순수 함수, 프록시 0). "장소→장소 거리"로 라벨.
- 지도 렌더: 기존 `NaverMap`에 폴리라인(네이버 `Polyline`) — 정점 marker + 측지선 segment. (NaverMap에 폴리라인 지원 추가/확인.)
- 공유 카드: `<canvas>`에 정적 지도 스냅샷(또는 단순화 경로 드로잉) + 커버 사진 + 스탯 텍스트 → `toBlob` → 공유. **원본 사진이 카드로 외부에 나가는 경우는 없음**(MVP는 커버 1장, 추후 공개 시 기존 P5 EXIF-스트립 발행 경로 경유).

### 3.3 데이터/RLS
- MVP 신규 스키마: **없음**(읽기 전용 기능). 기존 `trips/visits/places/photos/reactions` RLS가 커플 격리.
- (선택, 후속) 도로 스냅 시 `trip_recap_cache`(snapped polyline geojson, 여행당 1행, 커플 격리) — MVP엔 불필요.

## 4. 법/프라이버시 게이트
- **MVP: LBS 게이트 비해당.** 연속 위치 트레이스를 저장하지 않으므로 위치정보사업/위치기반서비스사업 신고·제3자 제공 동의 불필요. 앱스토어 프라이버시 라벨은 "위치 미수집(백그라운드)".
- 공유 카드는 기기 내 PNG만 → 공개 egress 경로 없음(보안 룰 §3 단일 공개 채널 원칙 유지).
- **R6(후속 GPS 에픽) 사전 게이트**(지금 빌드 X, 결정만 기록): 위치기반서비스사업 신고 + 위치정보 처리방침 + 별도 위치 동의 + **제3자 제공 동의**(상대가 내 트레이스를 봄). RLS는 **recap-only**(파트너 트레이스는 `trip.status='ENDED'` 전엔 비공개; `track_select` 술어 `owner_id=auth.uid() OR status='ENDED'`) — 라이브 가시성 금지(감시 프레이밍 회피).

## 5. 단계(빌드 순서)
1. **P-A Capacitor 패키징**: 플랫폼 추가, config, SW 게이트, 네이티브 OTP-우선 인증. (GPS 무관, 독립 머지 가능)
2. **P-B 리캡 read-model + 화면**: `useTripRecap`, 측지선 폴리라인 + 3-스탯 + 장소 미니카드(아바타·리액션) + 사진. 빈/로딩/에러.
3. **P-C 공유 카드**: canvas→PNG→`navigator.share`(+다운로드 폴백). reduce-motion·a11y.
4. **P-D 폴리시**: 다크/대비, 마이크로인터랙션, 실기기 확인 항목.

## 6. 테스트
- `useTripRecap` 도출(정점 순서, haversine 거리 합) 순수 단위 테스트.
- 빈 상태(방문 0 → "아직 동선이 없어요"), 단일 장소(선 없이 핀 1개) 엣지.
- 공유 카드 렌더(canvas 모킹) — 호출/폴백 경로.
- RLS: recap 쿼리가 타 커플 trip/visit 미노출(기존 격리 스위트 확장).
- Playwright: 리캡 화면 렌더/빈 상태 스모크(스텁 하베스). 네이티브 손맛·OTP·공유 시트는 실기기.

## 7. 열린 후속(R6 — 보류, 사용자 go 대기)
- 실제 GPS 브레드크럼 기록(네이티브 백그라운드 위치) → recap에 실제 경로 폴리라인.
- 게이트: 사업 신고 + 동의(별도·제3자) + recap-only RLS. 도로 스냅(선택).

## 정직성(검증 한계)
스텁 하베스는 네이티브 WebView·실기기 손맛·공유 시트·OTP 크로스컨텍스트를 못 봐. 코드/단위/하베스 DOM으로 검증하고, 네이티브 빌드·매직링크·`navigator.share`·배터리는 실기기 육안 확인을 단계 종료 시 명시.
