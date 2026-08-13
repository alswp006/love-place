import 'package:flutter_test/flutter_test.dart';
import 'package:weave/map/cluster.dart';
import 'package:weave/map/marker_diff.dart';
import 'package:weave/places/marker_visual.dart';

MarkerSpec _spec(String key, {bool selected = false, double lat = 37.5}) =>
    MarkerSpec(
      key: key,
      lat: lat,
      lng: 127.0,
      glyph: '☆',
      kind: MarkerKind.wish,
      label: '$key — 가고싶음',
      selected: selected,
      zIndex: selected ? selectedZIndex : baseZIndex,
    );

Map<String, MarkerSpec> _byKey(List<MarkerSpec> specs) =>
    {for (final s in specs) s.key: s};

void main() {
  group('diffMarkers — 변경분만 계산한다', () {
    test('처음엔 전부 add', () {
      final d = diffMarkers({}, [_spec('a'), _spec('b')]);
      expect(d.add.length, 2);
      expect(d.update, isEmpty);
      expect(d.remove, isEmpty);
    });

    test('같은 spec이면 아무것도 안 한다 — 팬 중 재계산돼도 마커를 안 만진다', () {
      final cur = _byKey([_spec('a'), _spec('b')]);
      final d = diffMarkers(cur, [_spec('a'), _spec('b')]);
      expect(d.isEmpty, isTrue);
    });

    test('사라진 키는 remove, 새 키는 add', () {
      final cur = _byKey([_spec('a'), _spec('b')]);
      final d = diffMarkers(cur, [_spec('b'), _spec('c')]);
      expect(d.add.map((s) => s.key), ['c']);
      expect(d.remove, ['a']);
    });

    test('웹판 B2 회귀 — 선택 변경은 정확히 2개 update, 파괴/재생성 0', () {
      // 웹판은 selectedId가 바뀌면 마커 전체를 재구성해 강조가 깜빡였다(R1.6).
      // diff에서는 이전 선택·새 선택 두 마커만 update로 나와야 한다.
      final cur = _byKey([_spec('a', selected: true), _spec('b'), _spec('c')]);
      final d = diffMarkers(cur, [
        _spec('a'),
        _spec('b', selected: true),
        _spec('c'),
      ]);
      expect(d.add, isEmpty);
      expect(d.remove, isEmpty);
      expect(d.update.map((s) => s.key).toSet(), {'a', 'b'});
    });

    test('좌표만 바뀐 마커는 update로 나온다', () {
      final cur = _byKey([_spec('a', lat: 37.5)]);
      final d = diffMarkers(cur, [_spec('a', lat: 37.6)]);
      expect(d.update.length, 1);
    });
  });

  group('buildMarkerSpecs', () {
    const places = {
      'a': (name: '카페', visited: false, bothWished: true),
      'b': (name: '식당', visited: true, bothWished: false),
    };

    test('단일 마커는 도출 시각(글리프·라벨·배지)을 담는다', () {
      final specs = buildMarkerSpecs(
        groups: const [
          SingleMarker(id: 'a', lat: 37.5, lng: 127.0),
          SingleMarker(id: 'b', lat: 37.6, lng: 127.1),
        ],
        places: places,
        selectedId: 'a',
      );
      final a = specs.firstWhere((s) => s.key == 'a');
      expect(a.glyph, '✦');
      expect(a.selected, isTrue);
      expect(a.zIndex, selectedZIndex);
      final b = specs.firstWhere((s) => s.key == 'b');
      expect(b.glyph, '★');
      expect(b.badge, '✓');
      expect(b.zIndex, baseZIndex);
    });

    test('클러스터 키는 멤버 집합으로 안정 — 순서가 달라도 같은 키', () {
      MarkerSpec clusterOf(List<String> ids) => buildMarkerSpecs(
            groups: [
              ClusterMarker(lat: 37.5, lng: 127.0, count: ids.length, ids: ids),
            ],
            places: places,
            selectedId: null,
          ).single;
      expect(clusterOf(['a', 'b']).key, clusterOf(['b', 'a']).key);
    });

    test('클러스터 라벨은 개수 텍스트 이중화(§8)', () {
      final c = buildMarkerSpecs(
        groups: const [
          ClusterMarker(lat: 37.5, lng: 127.0, count: 2, ids: ['a', 'b']),
        ],
        places: places,
        selectedId: null,
      ).single;
      expect(c.label, '장소 2곳 묶음');
      expect(c.clusterCount, 2);
    });

    test('places에 없는 id는 건너뛴다(웹판과 동일한 방어)', () {
      final specs = buildMarkerSpecs(
        groups: const [SingleMarker(id: 'ghost', lat: 37.5, lng: 127.0)],
        places: places,
        selectedId: null,
      );
      expect(specs, isEmpty);
    });

    test('order가 있으면 spec에 실린다 — Day를 바꾸면 diff가 update로 잡는다', () {
      // 웹판은 orderById를 effect deps에 넣는 걸 깜빡하면 이전 Day 번호가
      // 남는 함정이 있었다. spec 비교에는 깜빡할 deps가 없다.
      final before = buildMarkerSpecs(
        groups: const [SingleMarker(id: 'a', lat: 37.5, lng: 127.0)],
        places: places,
        selectedId: null,
        orderById: {'a': 1},
      );
      final after = buildMarkerSpecs(
        groups: const [SingleMarker(id: 'a', lat: 37.5, lng: 127.0)],
        places: places,
        selectedId: null,
        orderById: {'a': 2},
      );
      final d = diffMarkers(_byKey(before), after);
      expect(d.update.length, 1);
    });
  });
}
