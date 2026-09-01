/// 담은 장소를 **다시 찾는** 필터 — 웹판 `searchSaved.ts`의 이식.
///
/// 왜 필요한가: 지도 위 검색창은 외부 API로 *새* 장소를 발견하는 입구다. 이미 담은 곳 중
/// 하나를 꺼내려면 목록을 손으로 훑는 게 유일한 길이었고, 장소가 쌓일 때 가장 먼저 무너지는
/// 지점이 렌더 성능이 아니라 **'찾기'** 였다.
library;

import 'place_row.dart';

/// 비교용 정규화 — 대소문자·앞뒤 공백·연속 공백을 무시한다.
String _norm(String s) => s.toLowerCase().replaceAll(RegExp(r'\s+'), ' ').trim();

/// 이름·주소·지역·카테고리 중 **어디든** 부분 일치하면 통과.
///
/// 이름만 보지 않는 이유: "속초"라고 치면 이름에 속초가 없는 그 지역 장소들도 나와야
/// 사람이 기대하는 결과가 된다. "카페"도 마찬가지다.
///
/// 빈 질의는 **거르지 않는다** — 검색창이 비었을 때 목록이 사라지면 안 된다.
bool matchesQuery(PlaceRow p, String query) {
  final q = _norm(query);
  if (q.isEmpty) return true;
  for (final f in [p.name, p.address, p.regionLabel, p.category]) {
    if (f != null && f.isNotEmpty && _norm(f).contains(q)) return true;
  }
  return false;
}

/// 상태 필터 축 — 서로 배타적인 3값.
enum StatusFilter { all, wish, visited }

/// 상태 × 질의를 **곱해서** 적용한다.
///
/// 지도 시트는 컬렉션이 상태를 덮어쓰는 배타 구조라 "가본 곳 중에 속초"를 표현할 수 없었다.
/// 여기는 처음부터 교차로 간다.
List<PlaceRow> filterSaved(
  List<PlaceRow> places, {
  required StatusFilter status,
  required String query,
  required Set<String> visitedIds,
}) {
  final byStatus = switch (status) {
    StatusFilter.wish => places.where((p) => !visitedIds.contains(p.id)),
    StatusFilter.visited => places.where((p) => visitedIds.contains(p.id)),
    StatusFilter.all => places,
  };
  final q = _norm(query);
  if (q.isEmpty) return byStatus.toList(growable: false);
  return byStatus.where((p) => matchesQuery(p, q)).toList(growable: false);
}
