/// 초기 카메라 정책 — 명시적 상태기계.
///
/// ## 왜 상태기계인가 (웹판이 아팠던 이유)
///
/// 웹판 `NaverMap.tsx`는 초기 센터링을 **불리언 3개의 상호작용**으로 결정했다:
/// `centeredRef`(한 번이라도 잡았나) · `geoSettledRef`('pending'|'ok'|'failed') ·
/// `userMovedRef`(사용자가 드래그했나). 이 셋이 서로 다른 effect에서 갱신되다 보니
/// "빈→채움 순서 가드" 같은 주석이 붙는 창발적 규칙이 생겼고, 순서가 어긋나면
/// 지도가 엉뚱한 곳을 보거나 자동 이동이 사용자 조작을 덮어썼다.
///
/// 여기서는 **가능한 상태를 열거하고 전이만 허용**한다. 조합이 8가지에서 4가지로 줄고,
/// 각 전이가 테스트 한 줄로 고정된다.
library;

enum CameraState {
  /// 위치 응답을 기다리는 중. 아직 아무 데도 안 잡았다.
  awaitingGeo,

  /// 위치 실패 확정. places가 들어오면 그때 fitBounds 한 번(빈→채움 순서 가드).
  geoFailedAwaitingPlaces,

  /// 카메라를 잡았다(내 위치 또는 저장 장소). 더는 자동으로 안 움직인다.
  settled,

  /// 사용자가 지도를 조작했다. 자동 센터링은 영구 중단 — '내 위치' 버튼만 이긴다.
  userControlled,
}

/// 정책이 앱에 시키는 일.
sealed class CameraAction {
  const CameraAction();
}

/// 아무것도 하지 않는다.
class CameraNoop extends CameraAction {
  const CameraNoop();
}

/// 좌표 한 점으로 이동(내 위치).
class CameraMoveTo extends CameraAction {
  const CameraMoveTo({
    required this.lat,
    required this.lng,
    required this.zoom,
  });
  final double lat;
  final double lng;
  final double zoom;
}

/// 저장 장소 전체가 들어오도록 맞춘다.
class CameraFitPlaces extends CameraAction {
  const CameraFitPlaces();
}

/// 내 위치로 이동할 때 쓰는 줌 — 동네 수준.
///
/// 웹판 주석 그대로: `fitBounds(내위치+저장장소)`는 도(道) 단위로 벌어져 금지.
const double locateZoom = 15;

/// 초기 카메라 정책. 상태를 들고 있고, 사건을 받아 [CameraAction]을 돌려준다.
class CameraPolicy {
  CameraPolicy();

  CameraState _state = CameraState.awaitingGeo;
  CameraState get state => _state;

  /// 마지막으로 알던 위치(캐시) — **잡되 확정하지 않는다.**
  ///
  /// 정밀 위치가 곧 뒤따르므로 상태는 awaitingGeo에 머문다. 여기서 settled로 넘기면
  /// [onGeoResolved]가 무시돼 부정확한 캐시 좌표에 지도가 눌러앉는다.
  CameraAction onGeoHint(double lat, double lng) {
    if (_state != CameraState.awaitingGeo) return const CameraNoop();
    return CameraMoveTo(lat: lat, lng: lng, zoom: locateZoom);
  }

  /// 위치를 얻었다. 사용자가 이미 지도를 조작했으면 무시한다.
  CameraAction onGeoResolved(double lat, double lng) {
    if (_state == CameraState.userControlled ||
        _state == CameraState.settled) {
      return const CameraNoop();
    }
    _state = CameraState.settled;
    return CameraMoveTo(lat: lat, lng: lng, zoom: locateZoom);
  }

  /// 위치 실패(미허용·시간초과·미지원). 지도를 건드리지 않는다.
  ///
  /// 이 시점에 places가 이미 있으면 바로 맞추고, 없으면 [onPlacesLoaded]를 기다린다.
  CameraAction onGeoFailed({required bool hasPlaces}) {
    if (_state != CameraState.awaitingGeo) return const CameraNoop();
    if (hasPlaces) {
      _state = CameraState.settled;
      return const CameraFitPlaces();
    }
    _state = CameraState.geoFailedAwaitingPlaces;
    return const CameraNoop();
  }

  /// places가 적재됐다. 위치가 실패로 끝났고 아직 안 잡았을 때만 한 번 맞춘다.
  CameraAction onPlacesLoaded({required bool hasPlaces}) {
    if (_state != CameraState.geoFailedAwaitingPlaces || !hasPlaces) {
      return const CameraNoop();
    }
    _state = CameraState.settled;
    return const CameraFitPlaces();
  }

  /// 사용자가 지도를 드래그했다. 이후 자동 센터링 영구 중단.
  ///
  /// 프로그램적 줌 변경은 이 사건을 일으키면 안 된다(웹판이 `dragend`만 들은 이유).
  CameraAction onUserPanned() {
    _state = CameraState.userControlled;
    return const CameraNoop();
  }

  /// '내 위치' 버튼 — 사용자의 명시적 의사이므로 어떤 상태에서도 이긴다.
  CameraAction onLocatePressed(double lat, double lng) {
    _state = CameraState.settled;
    return CameraMoveTo(lat: lat, lng: lng, zoom: locateZoom);
  }
}
