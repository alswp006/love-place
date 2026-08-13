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

## 완료 (46 테스트 통과 · analyze 0)

```
lib/places/wish_status.dart      찜 상태 도출 — 웹판 충실 이식
lib/places/marker_visual.dart    마커 모양 도출(색+모양 이중화, §8)
lib/map/cluster.dart             그리드 클러스터러 — 웹판 충실 이식
lib/map/sheet_snap.dart          시트 스냅 전이 — 웹판 충실 이식
lib/map/map_focus.dart           ★ 신규 — C1 고침(시트 가림 보정)
lib/map/camera_policy.dart       ★ 신규 — C2 고침(초기 센터링 상태기계)
```

### 이식하며 잡은 함정

**Dart의 `List.sort`는 안정 정렬이 아니다.** 웹판 `attachAndSortWishes`는 JS `Array.sort`의
안정성(ES2019+)에 기대어 "동률이면 최신순 유지"를 얻고 있었다(주석에 명시돼 있음).
그대로 옮겼으면 동률 장소 순서가 조용히 깨졌을 것 — 원래 인덱스를 타이브레이커로 넣어 막았고
회귀 테스트로 못박았다(`wish_status_test.dart`).

---

## 다음 (수직 슬라이스 나머지)

- [ ] `lib/core/env.dart` — `--dart-define`으로 Supabase URL/anon, 네이버 client id 주입
      (**키는 클라이언트에 두지 않는다** — 네이버 REST·Claude·길찾기는 전부 Edge Function 프록시. CLAUDE.md §5)
- [ ] `lib/core/supabase.dart` — 클라이언트 싱글턴 + 세션 관리
- [ ] 인증 — OTP 6자리 우선(웹판이 네이티브에서 매직링크 PKCE 교차컨텍스트를 피한 이유와 동일), 딥링크 복귀
- [ ] `places` 조회 훅(Riverpod) + Realtime 구독 + `version` 조건부 업데이트(낙관적 락, CLAUDE.md §5-4)
- [ ] 지도 화면 — `NaverMap` + `contentPadding`에 `sheetOcclusionPx()` 연결
- [ ] 마커 **diff 갱신**(B2 고침 — 전체 재생성 금지)
- [ ] 장소 시트 — `DraggableScrollableSheet` + `sheet_snap.dart`
- [ ] 골든 테스트 — 빈 상태/로딩/다크(CLAUDE.md §6)

### 이 컨테이너에서 검증 가능한 것 / 아닌 것

가능: `flutter analyze`, `flutter test`, 골든 테스트, 의존성 해석.
**불가능: 실기기·시뮬레이터 지도 렌더링.** iOS 빌드·서명·TestFlight는 macOS/Xcode가 필요하다
(웹판도 동일하게 사용자 실행이었다). 지도 손맛 확인은 사용자 실행 단계다 — 수직 슬라이스를
먼저 만든 이유가 이 확인을 최대한 앞당기기 위해서다.

### 남은 리스크

- `flutter_naver_map` 1.4.4는 커뮤니티 패키지이고 8개월간 업데이트가 없다. 컴파일은 확인했으나
  **실기기 렌더링·클러스터링 성능은 미검증**이다. 수직 슬라이스의 핵심 판정 대상.
- `flutter_background_geolocation`은 Android release에 별도 라이선스가 필요하다(현재 Capacitor판과 동일 조건).
