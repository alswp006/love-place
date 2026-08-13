/// 검색 후보(PlaceHit) — Edge Function `naver-search`의 응답 행.
///
/// 정규화(HTML 태그 제거·좌표 변환·합성키 생성)는 **서버가 한다**(프록시가 정본).
/// 클라는 경계 파싱만. `kakaoPlaceId`는 D5 합성키(`norm(name)|norm(address)`) —
/// 이름만 카카오다.
library;

class PlaceHit {
  const PlaceHit({
    required this.kakaoPlaceId,
    required this.name,
    required this.address,
    required this.lat,
    required this.lng,
    required this.category,
    this.placeUrl,
    this.phone,
  });

  final String kakaoPlaceId;
  final String name;
  final String address;
  final double lat;
  final double lng;
  final String category;
  final String? placeUrl;
  final String? phone;

  static PlaceHit fromJson(Map<String, dynamic> j) {
    double num_(String key) {
      final v = j[key];
      if (v is int) return v.toDouble();
      if (v is double) return v;
      throw FormatException('필드 $key: 숫자 기대, ${v.runtimeType} 수신');
    }

    String str(String key) {
      final v = j[key];
      if (v is String) return v;
      throw FormatException('필드 $key: String 기대, ${v.runtimeType} 수신');
    }

    return PlaceHit(
      kakaoPlaceId: str('kakaoPlaceId'),
      name: str('name'),
      address: str('address'),
      lat: num_('lat'),
      lng: num_('lng'),
      category: j['category'] is String ? j['category'] as String : '',
      placeUrl: j['placeUrl'] as String?,
      phone: j['phone'] as String?,
    );
  }
}
