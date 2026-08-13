/// 지도 포커스 — **시트에 가려지지 않는 영역**을 기준으로 카메라를 잡는다.
///
/// ## 왜 이 파일이 새로 생겼나 (웹판의 실제 버그)
///
/// 웹판 `NaverMap.tsx`는 장소를 선택하면 이렇게 했다:
///
/// ```js
/// if (selectedId) { const m = markerMapRef.current.get(selectedId)
///                   if (m) map.panTo(m.getPosition()) }
/// ```
///
/// `panTo`는 마커를 **전체 뷰포트 중앙**에 놓는다. 그런데 `MapPage`는 선택과 동시에
/// 시트를 `peek → half`(뷰포트의 50%)로 승격시켰다. 결과적으로 **핀을 누를 때마다
/// 지도가 이동해 그 핀을 방금 올라온 시트 경계선 뒤로 밀어 넣었다.** 매번.
/// `full`(92%)에서는 완전히 사라졌다. 이것이 "지도가 어색하다"의 직접적 원인이다.
///
/// ## 고침
///
/// 네이버 **네이티브** SDK는 `contentPadding`을 지원한다. 시트가 가리는 높이를
/// 아래쪽 패딩으로 넘기면 SDK가 "논리적 뷰포트"를 가려지지 않은 영역으로 좁혀 준다.
/// 그러면 카메라 이동·`fitBounds`·네이버 로고/스케일바 위치가 **전부** 자동으로 맞는다.
/// 웹판이 CSS로 손수 흉내내던 것(`logoControlOptions: BOTTOM_LEFT` + mapWrap peek 인셋)이
/// SDK 기본 기능으로 사라진다.
library;

import 'sheet_snap.dart';

/// 시트가 화면 아래에서 가리는 높이(px).
///
/// [viewportHeight]는 지도 위젯의 높이, [peekPx]는 peek 정지 시 노출되는 콘텐츠 높이.
/// 시트가 닫혀 있으면([sheetOpen]=false) 0 — 지도가 화면 전체를 논리 뷰포트로 쓴다.
double sheetOcclusionPx({
  required bool sheetOpen,
  required SnapStop snap,
  required double viewportHeight,
  required double peekPx,
}) {
  if (!sheetOpen) return 0;
  if (viewportHeight <= 0) return 0;
  final raw = snap == SnapStop.peek
      ? peekPx
      : viewportHeight * snapRatios[snap]!;
  // 논리 뷰포트가 0이 되면 SDK가 카메라를 잡을 수 없다. 최소 25%는 지도로 남긴다.
  // (full=92%일 때 특히 중요 — 이 클램프가 없으면 fitBounds가 발산한다.)
  final maxOcclusion = viewportHeight * 0.75;
  final v = raw > maxOcclusion ? maxOcclusion : raw;
  return v < 0 ? 0 : v;
}

/// 카메라를 잡을 때 쓸 유효 뷰포트 높이(가려지지 않은 부분).
double visibleMapHeight({
  required double viewportHeight,
  required double occlusionPx,
}) {
  final v = viewportHeight - occlusionPx;
  return v < 0 ? 0 : v;
}

/// `contentPadding`을 못 쓰는 경로(예: 직접 좌표 보정이 필요할 때)를 위한 폴백.
///
/// 포커스 대상이 **가려지지 않은 영역의 중앙**에 오도록, 카메라 중심을 화면 아래쪽으로
/// 얼마나(px) 밀어야 하는지 돌려준다. `contentPadding`을 쓰면 이 값은 필요 없지만,
/// 두 경로가 같은 결과를 내는지 테스트로 대조하기 위해 순수 함수로 남긴다.
///
/// 유도: 카메라 중심 C는 화면 y=H/2에 나타난다. 포커스 점 P를 가시영역 중앙
/// y=(H-occ)/2 에 놓으려면 P가 중앙보다 occ/2 만큼 **위**에 있어야 하고,
/// 그러려면 카메라가 P보다 occ/2 만큼 **아래**를 봐야 한다.
double focusCenterOffsetPx({required double occlusionPx}) => occlusionPx / 2;
