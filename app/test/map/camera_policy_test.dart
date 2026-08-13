import 'package:flutter_test/flutter_test.dart';
import 'package:weave/map/camera_policy.dart';

void main() {
  group('CameraPolicy — 정상 경로', () {
    test('위치를 얻으면 그리로 이동하고 정착한다', () {
      final p = CameraPolicy();
      final a = p.onGeoResolved(37.5665, 126.978);
      expect(a, isA<CameraMoveTo>());
      expect((a as CameraMoveTo).zoom, locateZoom);
      expect(p.state, CameraState.settled);
    });

    test('정착 후에는 위치가 또 와도 안 움직인다 — 지도가 튀지 않게', () {
      final p = CameraPolicy();
      p.onGeoResolved(37.5, 127.0);
      expect(p.onGeoResolved(35.1, 129.0), isA<CameraNoop>());
    });
  });

  group('CameraPolicy — 빈→채움 순서 가드 (웹판이 주석으로 때우던 것)', () {
    test('위치 실패 + places 있음 → 즉시 fitBounds', () {
      final p = CameraPolicy();
      expect(p.onGeoFailed(hasPlaces: true), isA<CameraFitPlaces>());
      expect(p.state, CameraState.settled);
    });

    test('위치 실패 + places 비어 있음 → 대기했다가, 채워지면 그때 한 번', () {
      final p = CameraPolicy();
      expect(p.onGeoFailed(hasPlaces: false), isA<CameraNoop>());
      expect(p.state, CameraState.geoFailedAwaitingPlaces);

      expect(p.onPlacesLoaded(hasPlaces: true), isA<CameraFitPlaces>());
      expect(p.state, CameraState.settled);
    });

    test('fitBounds는 딱 한 번 — places가 또 갱신돼도 다시 안 맞춘다', () {
      final p = CameraPolicy();
      p.onGeoFailed(hasPlaces: false);
      p.onPlacesLoaded(hasPlaces: true);
      expect(p.onPlacesLoaded(hasPlaces: true), isA<CameraNoop>());
    });

    test('위치 성공했으면 places가 들어와도 fitBounds 안 한다', () {
      final p = CameraPolicy();
      p.onGeoResolved(37.5, 127.0);
      expect(p.onPlacesLoaded(hasPlaces: true), isA<CameraNoop>());
    });

    test('빈 places가 들어오는 건 아무 일도 아니다', () {
      final p = CameraPolicy();
      p.onGeoFailed(hasPlaces: false);
      expect(p.onPlacesLoaded(hasPlaces: false), isA<CameraNoop>());
      expect(p.state, CameraState.geoFailedAwaitingPlaces); // 계속 대기
    });
  });

  group('CameraPolicy — 사용자 조작이 자동 센터링을 이긴다', () {
    test('드래그 후엔 위치가 늦게 와도 지도를 뺏지 않는다', () {
      final p = CameraPolicy();
      p.onUserPanned();
      expect(p.onGeoResolved(37.5, 127.0), isA<CameraNoop>());
      expect(p.state, CameraState.userControlled);
    });

    test('드래그 후엔 places가 들어와도 fitBounds 안 한다', () {
      final p = CameraPolicy();
      p.onGeoFailed(hasPlaces: false);
      p.onUserPanned();
      expect(p.onPlacesLoaded(hasPlaces: true), isA<CameraNoop>());
    });

    test("'내 위치' 버튼은 사용자 의사라 어떤 상태에서도 이긴다", () {
      final p = CameraPolicy();
      p.onUserPanned();
      final a = p.onLocatePressed(37.5665, 126.978);
      expect(a, isA<CameraMoveTo>());
      expect(p.state, CameraState.settled);
    });
  });
}
