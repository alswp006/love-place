# Flutter 전환 — 진행 상황 · 인수인계

> 결정(2026-08-13): 웹을 쓰지 않기로 하면서 Capacitor(WebView) → **Flutter 네이티브**로 전환한다.
> 방식은 **지도 수직 슬라이스 먼저** — 인증 + 지도 + 장소를 먼저 완성해 실기기에서 손맛을 확인하고,
> 통과하면 캘린더·여행·사진·동선기록으로 확대한다.
>
> `supabase/`(마이그레이션 26 + Edge Function 8, 3,767줄)는 **한 줄도 바꾸지 않는다.** 클라이언트만 교체다.

---

## 왜 전환하나 — 지도 어색함의 실제 원인 9개

웹판 `src/components/map/NaverMap.tsx`(583줄, ref 20개)와 커밋 이력을 조사해 원인을 분류했다.

### A. WebView 탓 — Flutter가 없앤다 (4)

| # | 증상 | 근거 |
|---|---|---|
| A1 | 네이버 지도 인증이 페이지 호스트를 검사해, 앱 origin을 Railway 도메인으로 **위장** | `capacitor.config.ts` `server.hostname` |
| A2 | '내 위치' 버튼 하나 때문에 **백그라운드 위치 플러그인**을 끌어다 씀 | `recorder.ts`: "WebView geolocation의 origin 프롬프트/차단을 우회" |
| A3 | 마커가 DOM 노드 — 팬/줌마다 수백 개 합성 | `markerIconHtml()` |
| A4 | 인셋·키보드·탭바 높이 싸움 | `contentInset:'never'`, 커밋 `fa4d824` |

### B. 명령형 SDK ↔ React 임피던스 — 절반 나아진다 (2)

| # | 증상 | 근거 |
|---|---|---|
| B1 | stale closure 회피용 ref 4개 | `onCloseRef`/`onSelectRef`/`selectedIdRef`/`orderByIdRef` |
| B2 | `idle`·`zoom_changed`마다 **전 마커 파괴 후 재생성** → 선택 강조 깜빡임 | 주석 R1.6 |

### C. 순수 로직 — 옮겨도 따라온다, 그래서 **재설계했다** (3)

| # | 증상 | 상태 |
|---|---|---|
| **C1** | **핀을 누르면 지도가 그 핀을 시트 뒤로 숨긴다** — `panTo`는 전체 뷰포트 중앙 기준인데 선택 시 시트가 half(50%)로 승격됨. 매번 발생, full이면 완전히 사라짐 | ✅ `lib/map/map_focus.dart` |
| C2 | 초기 센터링이 불리언 3개(`centeredRef`/`geoSettledRef`/`userMovedRef`)의 창발적 상호작용 | ✅ `lib/map/camera_policy.dart` |
| C3 | 상세를 열면 지도가 영구히 잠기던 것 | 커밋 `5f06a9e`로 웹판은 수정됨. Flutter판은 시트 상태를 위젯이 소유하므로 구조적으로 재발 불가 |

**C1이 "어색함"의 직접 원인이다.** 네이티브 SDK의 `contentPadding`으로 고쳤다 — 시트가 가리는
높이를 넘기면 SDK가 논리 뷰포트를 좁혀, 카메라 이동·`fitBounds`·네이버 로고 위치가 전부 자동으로 맞는다.
웹판이 CSS로 흉내내던 게 SDK 기본 기능으로 사라진다.

---

## 환경

Flutter는 이 저장소에 포함되지 않는다. 새 세션에서는 설치부터:

```bash
cd /opt && curl -sSL -o f.tar.xz \
  "https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_3.44.9-stable.tar.xz" \
  && tar xf f.tar.xz && rm f.tar.xz
export PATH="/opt/flutter/bin:$PATH"
git config --global --add safe.directory /opt/flutter
cd /home/user/love-place/app && flutter pub get
```

**버전을 3.44.9로 고정한 이유:** 최신 stable은 3.47.0(2026-08-12 릴리스, 하루 됨)인데
`flutter_naver_map`이 2025-12 이후 업데이트가 없어 검증 위험이 크다. 3.44.9는 이전 stable 라인의
마지막 패치(2026-08-06)이고 아래 제약을 모두 만족한다:

| 패키지 | 버전 | 요구 |
|---|---|---|
| `flutter_naver_map` | 1.4.4 | Flutter ≥3.22.0 |
| `supabase_flutter` | 2.17.1 | Flutter ≥3.35.0, Dart ≥3.9.0 |
| `flutter_background_geolocation` | 5.5.0 | Flutter ≥3.38.0 |
| `flutter_riverpod` | 2.6.1 | (3.x는 의존성 충돌로 미해석) |

Flutter 3.44.9 = Dart 3.12.2 ✓

### 게이트

```bash
flutter analyze   # 0 issues
flutter test      # 전부 통과
```

---

## 완료 (75 테스트 통과 · analyze 0)

```
lib/places/wish_status.dart      찜 상태 도출 — 웹판 충실 이식
lib/places/marker_visual.dart    마커 모양 도출(색+모양 이중화, §8)
lib/places/place_row.dart        places/wishes 행 모델 + 경계 파싱(zod 역할)
lib/places/wish_aggregate.dart   wishes 행 → place별 집계(useWishes 가공부 이식)
lib/map/cluster.dart             그리드 클러스터러 — 웹판 충실 이식
lib/map/sheet_snap.dart          시트 스냅 전이 — 웹판 충실 이식
lib/map/map_focus.dart           ★ 신규 — C1 고침(시트 가림 보정)
lib/map/camera_policy.dart       ★ 신규 — C2 고침(초기 센터링 상태기계)
lib/map/marker_diff.dart         ★ 신규 — B2 고침(마커 diff, 전체 재생성 폐지)
lib/map/marker_icon.dart         핀/클러스터 위젯 + 아이콘 캐시 키(OKLCH→sRGB 정변환)
lib/map/map_view.dart            NaverMap 조립 — C1·C2·B2 합류점(웹판 NaverMap.tsx 대체)
lib/map/map_screen.dart          시트(DraggableScrollableSheet) + occlusion → contentPadding
lib/sync/versioned_update.dart   낙관적 락 — versionedUpdate/softDelete 이식(§4.3 비협상)
lib/geo/locator.dart             위치 래퍼 — A2 정식 대체(자동 locate는 granted만, 요청은 맥락)
lib/core/env.dart                dart-define 주입(전부 공개값 — 비공개 키 반입 금지)
lib/core/supabase.dart           싱글턴 초기화(publishableKey)
```

### 이식하며 잡은 함정 (전부 회귀 테스트로 못박음)

1. **Dart의 `List.sort`는 안정 정렬이 아니다.** 웹판 `attachAndSortWishes`는 JS `Array.sort`의
   안정성(ES2019+)에 기대어 "동률이면 최신순 유지"를 얻고 있었다. 인덱스 타이브레이커로 해결.
2. **`boundsSpanTiny` 임계값** — 웹판은 `0.0005°`(≈55m)인데 1차 이식이 `1e-6`으로 좁혔다.
   그대로면 수십 m 클러스터 클릭 시 fitBounds 과확대(웹판이 막아둔 버그)가 재발한다.
3. **줌은 소수다** — 네이티브 카메라 줌은 double. 셀 크기 계산이 정수부만 보면 핀치 도중
   클러스터가 계단식으로 튄다. `math.pow`로 연속화.
4. **Postgres numeric의 JSON int 함정** — 정수값 좌표가 int로 와서 double 캐스트가 터진다.
   경계 파서에서 승격.

### 설계 노트

- 마커 아이콘은 `NOverlayImage.fromWidget` + **변형당 1회 캐시**(`iconKeyOf`) — 마커 수백 개여도
  이미지 몇 개. 웹판이 마커마다 DOM을 만들던 것(A3)의 반대.
- 사용자 조작 감지는 `NCameraUpdateReason.gesture` — 웹판이 `dragend`만 들어 프로그램적
  줌의 오탐을 피하던 우회의 정식 대체.
- 시트 물리는 `DraggableScrollableSheet`(스냅 3점) — 커스텀 제스처 코드 없이 네이티브 감각.
  비율의 단일 출처는 `sheet_snap.dart`.

---

## 다음 (수직 슬라이스 나머지)

- [x] `lib/core/env.dart` — `--dart-define` 주입 (비공개 키 반입 금지, CLAUDE.md §5)
- [x] `lib/core/supabase.dart` — 클라이언트 싱글턴
- [x] 인증 — OTP 6자리 1차(`auth/login_screen.dart`; 매직링크 PKCE 교차컨텍스트 회피).
      OAuth(구글/애플)·딥링크 복귀는 후속.
- [x] `places`/`wishes`/`visits` 리포지토리(Riverpod, `state/places.dart`) + Realtime 구독
      (`realtimeSyncProvider` — 무효화로 일원화, 채널 dispose 정리) + 커플 게이트
      (`state/couple.dart` — ensure_solo_couple 마지막 방어선, 사용자당 1회) →
      `app_shell.dart`가 로그인→커플→지도를 게이트, `MapTab`이 실데이터 연결
- [ ] 위시 저장 흐름(검색 프록시 `naver-search` 호출 → 후보 → 저장 ≤3탭 회귀 테스트, ux §3)
- [ ] 위시 mutation(우선순위 하트 — versioned_update 사용) + 시트에 저장/하트 연결
- [x] 지도 화면 — `NaverMap` + `contentPadding`에 `sheetOcclusionPx()` 연결
- [x] 마커 **diff 갱신**(B2 고침 — 전체 재생성 금지)
- [x] 장소 시트 — `DraggableScrollableSheet` + `sheet_snap.dart` (최소판 — 저장/메모/리액션은 데이터 연결 후)
- [ ] 골든 테스트 — 빈 상태/로딩/다크(CLAUDE.md §6)
- [ ] iOS/Android 네이티브 폴더 커밋 정책 결정 + Info.plist 위치 권한 문구(WhenInUse)

### 이 컨테이너에서 검증 가능한 것 / 아닌 것

가능: `flutter analyze`, `flutter test`, 골든 테스트, 의존성 해석.
**불가능: 실기기·시뮬레이터 지도 렌더링.** iOS 빌드·서명·TestFlight는 macOS/Xcode가 필요하다
(웹판도 동일하게 사용자 실행이었다). 지도 손맛 확인은 사용자 실행 단계다 — 수직 슬라이스를
먼저 만든 이유가 이 확인을 최대한 앞당기기 위해서다.

### 남은 리스크

- `flutter_naver_map` 1.4.4는 커뮤니티 패키지이고 8개월간 업데이트가 없다. 컴파일은 확인했으나
  **실기기 렌더링·클러스터링 성능은 미검증**이다. 수직 슬라이스의 핵심 판정 대상.
- `flutter_background_geolocation`은 Android release에 별도 라이선스가 필요하다(현재 Capacitor판과 동일 조건).
