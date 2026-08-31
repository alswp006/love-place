import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:weave/map/camera_policy.dart';
import 'package:weave/map/map_view.dart';

/// C1의 나머지 절반 — 고른 핀을 시트 위(보이는 띠)로 데려오는 **배선**.
///
/// 왜 이 테스트가 따로 필요한가: `map_focus_test.dart`는 초점 계산(순수 함수)을 이미 못박고
/// 있었다. 그런데 그 함수들(`focusCenterOffsetPx`·`visibleMapHeight`)은 **앱 코드에서 한 번도
/// 불리지 않았다** — 테스트에서만 불렸다. 그래서 계산은 맞는데 화면에서는 아무 일도 일어나지
/// 않았다(시뮬레이터에서 아래쪽 핀을 탭하면 시트가 덮은 채 그대로였다).
///
/// contentPadding만으로는 부족하다. 그건 '카메라를 움직일 때 시트를 뺀 영역을 기준으로 삼는다'는
/// 규칙일 뿐이라, 카메라를 아예 안 움직이면 아무 효과가 없다.
///
/// 그래서 여기서는 값이 아니라 **동작이 요청되었는가**를 본다.
void main() {
  const seoul = MapPlace(id: 'p1', name: '가', lat: 37.5, lng: 127.0);
  const sokcho = MapPlace(id: 'p2', name: '나', lat: 38.2, lng: 128.6);

  Widget host(String? selectedId) => MaterialApp(
        home: MapView(places: const [seoul, sokcho], selectedId: selectedId),
      );

  setUp(() => debugLastCameraAction = null);

  testWidgets('핀을 고르면 그 좌표로 카메라 이동이 요청된다', (tester) async {
    await tester.pumpWidget(host(null));
    debugLastCameraAction = null; // 마운트 시의 초기 카메라 동작은 관심 밖

    await tester.pumpWidget(host('p2'));
    await tester.pump();

    final a = debugLastCameraAction;
    expect(a, isA<CameraMoveTo>(),
        reason: '선택이 바뀌었는데 카메라 이동이 요청되지 않았다 — C1이 배선되지 않은 상태');
    a as CameraMoveTo;
    expect(a.lat, sokcho.lat);
    expect(a.lng, sokcho.lng);
  });

  testWidgets('선택을 풀면 카메라를 건드리지 않는다(닫았다고 화면이 튀면 안 된다)', (tester) async {
    await tester.pumpWidget(host('p2'));
    await tester.pump();
    debugLastCameraAction = null;

    await tester.pumpWidget(host(null));
    await tester.pump();

    expect(debugLastCameraAction, isNull);
  });

  testWidgets('같은 핀이 다시 들어와도 재이동하지 않는다(리빌드마다 지도가 움직이면 안 된다)', (tester) async {
    await tester.pumpWidget(host('p1'));
    await tester.pump();
    debugLastCameraAction = null;

    await tester.pumpWidget(host('p1')); // 같은 선택으로 리빌드
    await tester.pump();

    expect(debugLastCameraAction, isNull);
  });

  testWidgets('좌표가 없는 장소를 고르면 조용히 넘어간다(카메라가 0,0으로 날아가지 않게)', (tester) async {
    // lat/lng가 없는 장소는 _coordPlaces에서 빠진다 — 그런 id가 선택돼도 이동은 없어야 한다.
    await tester.pumpWidget(MaterialApp(
      home: MapView(places: const [seoul], selectedId: null),
    ));
    debugLastCameraAction = null;
    await tester.pumpWidget(MaterialApp(
      home: MapView(places: const [seoul], selectedId: '없는id'),
    ));
    await tester.pump();
    expect(debugLastCameraAction, isNull);
  });
}
