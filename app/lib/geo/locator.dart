/// 현재 위치 래퍼 — 웹판 `lib/geo/currentPosition.ts`의 시맨틱 이식.
///
/// 웹판(A2 병리)은 WebView geolocation의 origin 프롬프트/차단 때문에 '내 위치'
/// 버튼 하나에 백그라운드 위치 플러그인의 원샷 API를 끌어다 썼다. 네이티브에서는
/// 그 우회 자체가 사라진다 — geolocator의 표준 앱 권한 프롬프트면 충분하다.
///
/// 규율(웹판과 동일):
/// - **자동 locate는 이미 granted일 때만**(spec §3.5 — 추가 프롬프트 금지).
/// - **권한 요청은 맥락에서만**('내 위치' 버튼을 눌렀을 때, security §3.1).
/// - 결과는 [GeoResult]로 정규화(ok / denied / unavailable / timeout / unsupported).
library;

import 'package:geolocator/geolocator.dart';

sealed class GeoResult {
  const GeoResult();
}

class GeoOk extends GeoResult {
  const GeoOk({required this.lat, required this.lng, required this.accuracy});
  final double lat;
  final double lng;
  final double accuracy;
}

class GeoFail extends GeoResult {
  const GeoFail(this.reason);
  final GeoFailReason reason;
}

enum GeoFailReason { unsupported, denied, unavailable, timeout }

/// 위치 서비스 꺼짐/거부 시 한국어 안내 — 웹판 recorder.ts의 메시지와 통일.
const locationServicesOffMsg =
    '위치 서비스가 꺼져 있어요. 설정 › 개인정보 보호 및 보안 › 위치 서비스를 켠 뒤 다시 시도해주세요.';
const locationPermissionDeniedMsg =
    '위치 권한이 필요해요. 설정에서 이 앱의 위치 접근을 "앱을 사용하는 동안"으로 허용해주세요.';

/// 주입 가능한 위치 소스 — 테스트에서 모킹(웹판 geo 주입과 동일 패턴).
abstract interface class Locator {
  /// 프롬프트 없이 현재 권한 상태만 확인.
  Future<bool> isGranted();

  /// 현재 위치 1회. [requestIfNeeded]면 이 시점에 권한 프롬프트 허용(맥락 요청).
  Future<GeoResult> current({bool requestIfNeeded = false});
}

/// geolocator 구현. iOS WhenInUse 전제(Always 회피 — 설계 §6과 동일 철학).
class GeolocatorLocator implements Locator {
  const GeolocatorLocator({this.timeout = const Duration(seconds: 8)});
  final Duration timeout;

  @override
  Future<bool> isGranted() async {
    final p = await Geolocator.checkPermission();
    return p == LocationPermission.always ||
        p == LocationPermission.whileInUse;
  }

  @override
  Future<GeoResult> current({bool requestIfNeeded = false}) async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return const GeoFail(GeoFailReason.unavailable);
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied && requestIfNeeded) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return const GeoFail(GeoFailReason.denied);
    }
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: timeout,
        ),
      );
      return GeoOk(
        lat: pos.latitude,
        lng: pos.longitude,
        accuracy: pos.accuracy,
      );
    } on Exception catch (e) {
      // TimeoutException 포함 — 웹판 reasonForCode(3=timeout)와 동일 정규화.
      final isTimeout = e.toString().contains('Timeout');
      return GeoFail(
        isTimeout ? GeoFailReason.timeout : GeoFailReason.unavailable,
      );
    }
  }
}
