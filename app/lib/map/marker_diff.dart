/// 마커 diff — **전체 재생성 금지**(웹판 B2 병리의 고침).
///
/// ## 왜 이 파일이 새로 생겼나
///
/// 웹판 `NaverMap.tsx`는 `idle`·`zoom_changed`마다 마커 전부를 `setMap(null)`로
/// 파괴하고 다시 만들었다. 그 결과 ① 선택 강조가 pan/zoom에서 깜빡 사라졌고
/// (주석 R1.6이 ref 우회로 때움) ② 장소 수백 개면 매 프레임 DOM 수백 개를 다시
/// 만들었다. 여기서는 **원하는 상태(spec) ↔ 현재 상태를 비교해 변경분만** 적용한다.
/// 변하지 않은 마커는 손대지 않는다 — 깜빡임이 구조적으로 불가능해진다.
///
/// 순수 로직(SDK 비의존). 위젯은 [MarkerDiff]를 받아 NMarker에 적용만 한다.
library;

import '../places/marker_visual.dart';
import 'cluster.dart';

/// 웹판 `selectedMarker.ts`와 동일한 층위.
const int baseZIndex = 1;
const int selectedZIndex = 1000;

/// 오버레이 하나의 "원하는 상태". [==]가 성립하면 그 마커는 손댈 필요가 없다.
class MarkerSpec {
  const MarkerSpec({
    required this.key,
    required this.lat,
    required this.lng,
    required this.glyph,
    required this.kind,
    required this.label,
    required this.zIndex,
    this.badge,
    this.order,
    this.selected = false,
    this.clusterCount,
  });

  /// 안정 식별자 — 단일은 place id, 클러스터는 멤버 id 정렬 결합
  /// (줌이 같으면 팬 중에도 동일 키 → 손대지 않음).
  final String key;
  final double lat;
  final double lng;
  final String glyph;
  final MarkerKind kind;

  /// 접근성 라벨(스크린리더·SDK 캡션).
  final String label;
  final int zIndex;
  final String? badge;

  /// 여행 Day 스톱 순번(1-based). 있으면 글리프 대신 숫자를 그린다.
  final int? order;
  final bool selected;

  /// 클러스터면 멤버 수, 단일이면 null.
  final int? clusterCount;

  bool get isCluster => clusterCount != null;

  @override
  bool operator ==(Object other) =>
      other is MarkerSpec &&
      other.key == key &&
      other.lat == lat &&
      other.lng == lng &&
      other.glyph == glyph &&
      other.kind == kind &&
      other.label == label &&
      other.zIndex == zIndex &&
      other.badge == badge &&
      other.order == order &&
      other.selected == selected &&
      other.clusterCount == clusterCount;

  @override
  int get hashCode => Object.hash(key, lat, lng, glyph, kind, label, zIndex,
      badge, order, selected, clusterCount);
}

/// 적용할 변경분. [add]·[update]·[remove] 밖의 마커는 절대 손대지 않는다.
class MarkerDiff {
  const MarkerDiff({
    required this.add,
    required this.update,
    required this.remove,
  });
  final List<MarkerSpec> add;
  final List<MarkerSpec> update;
  final List<String> remove;

  bool get isEmpty => add.isEmpty && update.isEmpty && remove.isEmpty;
}

/// 현재 상태(key→spec) 대비 원하는 목록의 변경분.
MarkerDiff diffMarkers(
  Map<String, MarkerSpec> current,
  List<MarkerSpec> desired,
) {
  final add = <MarkerSpec>[];
  final update = <MarkerSpec>[];
  final seen = <String>{};
  for (final spec in desired) {
    seen.add(spec.key);
    final cur = current[spec.key];
    if (cur == null) {
      add.add(spec);
    } else if (cur != spec) {
      update.add(spec);
    }
  }
  final remove = current.keys.where((k) => !seen.contains(k)).toList();
  return MarkerDiff(add: add, update: update, remove: remove);
}

/// 클러스터 출력 + 도출 상태 → 원하는 마커 목록.
///
/// 웹판 마커 생성 effect의 본문에 해당하지만, 여기는 **그리지 않고 기술만** 한다.
List<MarkerSpec> buildMarkerSpecs({
  required List<ClusterOrSingle> groups,
  required Map<String, ({String name, bool visited, bool bothWished})> places,
  required String? selectedId,
  Map<String, int>? orderById,
}) {
  final out = <MarkerSpec>[];
  for (final g in groups) {
    switch (g) {
      case SingleMarker(:final id, :final lat, :final lng):
        final p = places[id];
        if (p == null) continue;
        final visual = markerVisual(
          visited: p.visited,
          bothWished: p.bothWished,
          name: p.name,
        );
        final selected = id == selectedId;
        out.add(MarkerSpec(
          key: id,
          lat: lat,
          lng: lng,
          glyph: visual.glyph,
          kind: visual.kind,
          label: visual.label,
          badge: visual.badge,
          order: orderById?[id],
          selected: selected,
          zIndex: selected ? selectedZIndex : baseZIndex,
        ));
      case ClusterMarker(:final lat, :final lng, :final count, :final ids):
        final sorted = [...ids]..sort();
        out.add(MarkerSpec(
          key: 'c:${sorted.join(',')}',
          lat: lat,
          lng: lng,
          glyph: '$count',
          kind: MarkerKind.wish,
          label: '장소 $count곳 묶음', // 색+개수 텍스트 이중화(§8)
          zIndex: baseZIndex,
          clusterCount: count,
        ));
    }
  }
  return out;
}
