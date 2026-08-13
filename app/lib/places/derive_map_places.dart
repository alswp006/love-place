/// places + wishes + visits → 지도 마커 입력. 순수 함수.
///
/// "상태는 도출, 저장 아님"(CLAUDE.md §7): visited = visits에 place_id 존재,
/// bothWished = wishes 집계 인원 ≥ 2. place.status 같은 플래그는 없다.
library;

import '../map/map_view.dart';
import 'place_row.dart';
import 'wish_status.dart';

List<MapPlace> deriveMapPlaces({
  required List<PlaceRow> places,
  required Map<String, WishInfo> wishesByPlace,
  required Set<String> visitedPlaceIds,
}) {
  final out = <MapPlace>[];
  for (final p in places) {
    if (!p.hasCoords) continue; // 좌표 없는 장소는 지도에 못 찍는다(웹판 동일 필터)
    final wish = deriveWishStatus(wishesByPlace[p.id], null);
    out.add(MapPlace(
      id: p.id,
      name: p.name,
      lat: p.lat!,
      lng: p.lng!,
      visited: visitedPlaceIds.contains(p.id),
      bothWished: wish.bothWished,
    ));
  }
  return out;
}
