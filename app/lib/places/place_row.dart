/// places 행 모델 + 경계 파싱.
///
/// 외부 응답(Supabase row)은 경계에서 검증 후 타입을 신뢰한다(web-stack.md §1 —
/// 웹판의 zod 역할). 필드 셋은 웹판 `usePlaces.ts`의 select와 동일.
///
/// `kakao_place_id`: D5 결정으로 이름만 카카오다 — 네이버는 고유 장소 ID가 없어
/// `norm(name)|norm(address)` 합성키가 들어 있다. 컬럼명은 롤백 보존을 위해 유지.
library;

class PlaceRow {
  const PlaceRow({
    required this.id,
    required this.name,
    required this.address,
    required this.regionLabel,
    required this.lat,
    required this.lng,
    required this.category,
    required this.kakaoPlaceId,
    required this.addedBy,
    required this.version,
  });

  final String id;
  final String name;
  final String? address;
  final String? regionLabel;
  final double? lat;
  final double? lng;
  final String? category;
  final String? kakaoPlaceId;
  final String addedBy;
  final int version;

  /// 좌표가 있어야 지도에 찍을 수 있다(웹판 마커 필터와 동일 조건).
  bool get hasCoords => lat != null && lng != null;

  static PlaceRow fromJson(Map<String, dynamic> json) {
    return PlaceRow(
      id: _string(json, 'id'),
      name: _string(json, 'name'),
      address: _stringOrNull(json, 'address'),
      regionLabel: _stringOrNull(json, 'region_label'),
      lat: _doubleOrNull(json, 'lat'),
      lng: _doubleOrNull(json, 'lng'),
      category: _stringOrNull(json, 'category'),
      kakaoPlaceId: _stringOrNull(json, 'kakao_place_id'),
      addedBy: _string(json, 'added_by'),
      version: _int(json, 'version'),
    );
  }
}

/// wishes 행(내 위시 상세) — 우선순위 변경은 낙관적 락에 version이 필요.
class WishRow {
  const WishRow({
    required this.id,
    required this.placeId,
    required this.userId,
    required this.priority,
    required this.version,
  });

  final String id;
  final String placeId;
  final String userId;
  final int priority;
  final int version;

  static WishRow fromJson(Map<String, dynamic> json) => WishRow(
        id: _string(json, 'id'),
        placeId: _string(json, 'place_id'),
        userId: _string(json, 'user_id'),
        // priority는 nullable 컬럼 — 웹판도 `row.priority ?? 0`으로 방어한다.
        priority: _intOrNull(json, 'priority') ?? 0,
        version: _int(json, 'version'),
      );
}

// ---- 경계 파싱 헬퍼: 실패 시 필드명이 박힌 FormatException(디버깅 가능한 거부) ----

String _string(Map<String, dynamic> j, String key) {
  final v = j[key];
  if (v is String) return v;
  throw FormatException('필드 $key: String 기대, ${v.runtimeType} 수신');
}

String? _stringOrNull(Map<String, dynamic> j, String key) {
  final v = j[key];
  if (v == null) return null;
  if (v is String) return v;
  throw FormatException('필드 $key: String? 기대, ${v.runtimeType} 수신');
}

int _int(Map<String, dynamic> j, String key) {
  final v = j[key];
  if (v is int) return v;
  throw FormatException('필드 $key: int 기대, ${v.runtimeType} 수신');
}

int? _intOrNull(Map<String, dynamic> j, String key) {
  final v = j[key];
  if (v == null) return null;
  if (v is int) return v;
  throw FormatException('필드 $key: int? 기대, ${v.runtimeType} 수신');
}

double? _doubleOrNull(Map<String, dynamic> j, String key) {
  final v = j[key];
  if (v == null) return null;
  // Postgres numeric이 정수값이면 JSON에서 int로 온다 — double로 승격.
  if (v is int) return v.toDouble();
  if (v is double) return v;
  throw FormatException('필드 $key: double? 기대, ${v.runtimeType} 수신');
}
