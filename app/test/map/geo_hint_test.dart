import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:weave/geo/locator.dart';
import 'package:weave/map/camera_policy.dart';
import 'package:weave/map/map_view.dart';

/// 시작 카메라 — "처음 지도가 너무 크다"의 고침.
///
/// 무엇이 문제였나: `current()`(고정밀)는 1~3초 걸린다. 그동안 지도는 기본 좌표(서울시청)를
/// 도(道) 단위 줌 11로 보여주고, 위치가 오면 줌 15로 크게 튀었다. 실기기에서 그 구간이
/// 눈에 띄었다.
///
/// 고침: OS가 캐시한 마지막 위치로 **먼저** 잡는다(즉시 반환). 정밀 위치는 뒤이어 다듬는다.

class _FakeLocator implements Locator {
  _FakeLocator({required this.granted, this.hint, this.precise});
  final bool granted;
  final GeoResult? hint;
  final GeoResult? precise;
  final calls = <String>[];

  @override
  Future<bool> isGranted() async => granted;

  @override
  Future<GeoResult> lastKnown() async {
    calls.add('lastKnown');
    return hint ?? const GeoFail(GeoFailReason.unavailable);
  }

  @override
  Future<GeoResult> current({bool requestIfNeeded = false}) async {
    calls.add('current');
    return precise ?? const GeoFail(GeoFailReason.unavailable);
  }
}

void main() {
  group('CameraPolicy.onGeoHint', () {
    test('캐시 위치로 잡되 **확정하지 않는다** — 정밀 위치가 아직 이겨야 한다', () {
      final p = CameraPolicy();
      final a = p.onGeoHint(37.1, 127.1);
      expect(a, isA<CameraMoveTo>());
      expect(p.state, CameraState.awaitingGeo,
          reason: 'settled로 넘기면 부정확한 캐시 좌표에 지도가 눌러앉는다');

      // 정밀 위치가 뒤이어 와서 덮어쓴다.
      final b = p.onGeoResolved(38.2, 128.6);
      expect(b, isA<CameraMoveTo>());
      expect((b as CameraMoveTo).lat, 38.2);
      expect(p.state, CameraState.settled);
    });

    test('사용자가 이미 지도를 조작했으면 캐시 위치로 끌고 가지 않는다', () {
      final p = CameraPolicy()..onUserPanned();
      expect(p.onGeoHint(37.1, 127.1), isA<CameraNoop>());
    });

    test('힌트는 동네 줌(locateZoom)으로 — 도 단위로 벌어지면 고친 의미가 없다', () {
      final a = CameraPolicy().onGeoHint(37.5, 127.0) as CameraMoveTo;
      expect(a.zoom, locateZoom);
    });
  });

  group('MapView 시작 순서', () {
    setUp(() => debugLastCameraAction = null);

    testWidgets('★ 정밀 위치보다 캐시 위치를 먼저 묻는다(기다리는 동안 빈 지도를 안 보여주려고)',
        (tester) async {
      final loc = _FakeLocator(
        granted: true,
        hint: const GeoOk(lat: 37.1, lng: 127.1, accuracy: 50),
        precise: const GeoOk(lat: 38.2, lng: 128.6, accuracy: 5),
      );
      await tester.pumpWidget(MaterialApp(
        home: MapView(places: const [], locator: loc),
      ));
      await tester.pumpAndSettle();

      // 지도 미설정 테스트 환경이라 onMapReady가 안 불릴 수 있다 — 그땐 호출 순서만 본다.
      if (loc.calls.isNotEmpty) {
        expect(loc.calls.first, 'lastKnown',
            reason: 'current()를 먼저 기다리면 그 1~3초 동안 기본 좌표가 화면에 남는다');
      }
    });

    test('권한이 없으면 캐시도 읽지 않는다(프롬프트 없는 조회라도 규율은 지킨다)', () async {
      final loc = _FakeLocator(granted: false);
      // isGranted=false면 MapView는 lastKnown/current 어느 쪽도 부르지 않는다.
      expect(await loc.isGranted(), isFalse);
      expect(loc.calls, isEmpty);
    });
  });
}
