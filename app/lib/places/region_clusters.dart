/// 지역별 묶기 — 웹판 `regionClusters.ts`의 이식.
///
/// ## 알고 가는 한계: 좌표가 아니라 문자열이다
///
/// 이름이 '클러스터'지만 좌표 근접도 계산이 아니다. `places.region_code`가 **DB에서 항상
/// NULL**이라(주소 파서가 무조건 null을 반환한다) 실질 키는 `region_label` 문자열 하나다.
/// 그래서 "속초"와 "속초시"는 다른 그룹이 된다.
///
/// 고치려면 저장 시점의 주소 파싱을 손봐야 하고 기존 행도 백필해야 한다 — 스키마를 안 바꾸는
/// 이번 이식의 범위 밖이라 웹판과 같은 한계를 그대로 물려받는다.
library;

import 'place_row.dart';

/// 코스를 짤 만큼 모였다고 보는 최소 개수(웹판과 동일).
const recoThreshold = 3;

class RegionCluster {
  const RegionCluster({
    required this.label,
    required this.places,
    required this.ready,
  });

  final String label;
  final List<PlaceRow> places;

  /// 임계치를 넘겼나 — 코스 CTA를 붙일지 가르는 값.
  final bool ready;

  int get count => places.length;
}

/// 지역별로 묶어 **개수 내림차순**으로. 라벨이 없으면 '기타'.
///
/// 개수 순인 이유: 많이 모인 지역이 다음 여행지일 가능성이 높고, 코스를 짤 수 있는 것도
/// 그쪽이다. 가나다순이면 매번 같은 지역이 위에 붙어 화면이 죽는다.
List<RegionCluster> regionClusters(
  List<PlaceRow> places, {
  int threshold = recoThreshold,
}) {
  final map = <String, List<PlaceRow>>{};
  for (final p in places) {
    final label = (p.regionLabel?.trim().isNotEmpty ?? false)
        ? p.regionLabel!.trim()
        : '기타';
    (map[label] ??= []).add(p);
  }
  final out = map.entries
      .map((e) => RegionCluster(
            label: e.key,
            places: e.value,
            ready: e.value.length >= threshold,
          ))
      .toList();
  // 개수가 같으면 라벨 순 — 안정적인 순서라야 갱신마다 목록이 요동치지 않는다.
  out.sort((a, b) {
    final c = b.count.compareTo(a.count);
    return c != 0 ? c : a.label.compareTo(b.label);
  });
  return out;
}
