/// 마커 클러스터링 — 순수 그리드 클러스터러.
///
/// 웹판 `src/lib/places/clusterPlaces.ts`의 충실한 이식(같은 셀 크기 = 같은 시각 결과).
/// 줌이 높을수록 셀이 작아져 분해능↑. 좌표는 멤버 centroid. SDK 비의존이라 테스트가 쉽다.
library;

class ClusterPoint {
  const ClusterPoint({required this.id, required this.lat, required this.lng});
  final String id;
  final double lat;
  final double lng;
}

/// 단일 마커 또는 묶음.
sealed class ClusterOrSingle {
  const ClusterOrSingle({required this.lat, required this.lng});
  final double lat;
  final double lng;
}

class SingleMarker extends ClusterOrSingle {
  const SingleMarker({
    required this.id,
    required super.lat,
    required super.lng,
  });
  final String id;
}

class ClusterMarker extends ClusterOrSingle {
  const ClusterMarker({
    required super.lat,
    required super.lng,
    required this.count,
    required this.ids,
  });
  final int count;
  final List<String> ids;
}

/// 줌별 그리드 셀 크기(도, degrees). base 1.0° at zoom 6, 줌 1 증가마다 절반.
///
/// zoom<=6: ~1.0°(~111km), zoom 12: ~1.56e-2°(~1.7km),
/// zoom 18: ~2.44e-4°(~27m), zoom 20: ~6.10e-5°(~6.8m).
double cellSizeDeg(double zoom) {
  final exp = (zoom - 6) < 0 ? 0.0 : (zoom - 6);
  return 1.0 / _pow2(exp);
}

double _pow2(double e) {
  var r = 1.0;
  var n = e;
  // 정수부는 곱셈으로, 소수부는 무시(웹판 Math.pow와 달리 줌은 항상 정수로 들어온다).
  while (n >= 1) {
    r *= 2;
    n -= 1;
  }
  return r;
}

List<ClusterOrSingle> clusterPlaces(List<ClusterPoint> points, double zoom) {
  if (points.isEmpty) return const [];
  final size = cellSizeDeg(zoom);
  final buckets = <String, List<ClusterPoint>>{};
  for (final p in points) {
    final gx = (p.lng / size).floor();
    final gy = (p.lat / size).floor();
    buckets.putIfAbsent('$gx:$gy', () => []).add(p);
  }
  final out = <ClusterOrSingle>[];
  for (final arr in buckets.values) {
    if (arr.length == 1) {
      final p = arr.first;
      out.add(SingleMarker(id: p.id, lat: p.lat, lng: p.lng));
    } else {
      final count = arr.length;
      final lat = arr.fold<double>(0, (s, p) => s + p.lat) / count;
      final lng = arr.fold<double>(0, (s, p) => s + p.lng) / count;
      out.add(ClusterMarker(
        lat: lat,
        lng: lng,
        count: count,
        ids: arr.map((p) => p.id).toList(),
      ));
    }
  }
  return out;
}

/// 클러스터 멤버들의 좌표만 추린다(줌인 대상 bounds 계산용).
List<ClusterPoint> clusterMemberPts(
  List<String> ids,
  List<ClusterPoint> all,
) {
  final want = ids.toSet();
  return all.where((p) => want.contains(p.id)).toList();
}

/// 멤버들이 사실상 한 점에 뭉쳐 있는가(fitBounds가 무의미할 만큼).
///
/// true면 fitBounds 대신 setZoom(+3)으로 파고든다 — 웹판과 동일한 분기.
bool boundsSpanTiny(List<ClusterPoint> pts, {double epsilon = 1e-6}) {
  if (pts.length < 2) return true;
  var minLat = pts.first.lat, maxLat = pts.first.lat;
  var minLng = pts.first.lng, maxLng = pts.first.lng;
  for (final p in pts) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return (maxLat - minLat) < epsilon && (maxLng - minLng) < epsilon;
}
