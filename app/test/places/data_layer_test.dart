import 'package:flutter_test/flutter_test.dart';
import 'package:weave/places/place_row.dart';
import 'package:weave/places/wish_aggregate.dart';
import 'package:weave/sync/versioned_update.dart';

void main() {
  group('PlaceRow.fromJson — 경계 파싱', () {
    final full = {
      'id': 'p1',
      'name': '망원한강공원',
      'address': '서울 마포구',
      'region_label': '서울',
      'lat': 37.5556,
      'lng': 126.8958,
      'category': '공원',
      'kakao_place_id': 'k|1',
      'added_by': 'u1',
      'version': 3,
    };

    test('정상 행 파싱', () {
      final p = PlaceRow.fromJson(full);
      expect(p.name, '망원한강공원');
      expect(p.hasCoords, isTrue);
      expect(p.version, 3);
    });

    test('numeric이 정수로 오면 double로 승격(Postgres JSON 함정)', () {
      final p = PlaceRow.fromJson({...full, 'lat': 37, 'lng': 127});
      expect(p.lat, 37.0);
      expect(p.hasCoords, isTrue);
    });

    test('좌표 null이면 hasCoords false — 지도에 안 찍는다', () {
      final p = PlaceRow.fromJson({...full, 'lat': null, 'lng': null});
      expect(p.hasCoords, isFalse);
    });

    test('타입이 틀리면 필드명이 박힌 FormatException — 조용한 오염 금지', () {
      expect(
        () => PlaceRow.fromJson({...full, 'version': '3'}),
        throwsA(isA<FormatException>()
            .having((e) => e.message, 'message', contains('version'))),
      );
    });
  });

  group('aggregateWishes — 웹판 useWishes 가공의 이식', () {
    WishRow row(String id, String place, String user,
            {int priority = 0, int version = 1}) =>
        WishRow(
            id: id,
            placeId: place,
            userId: user,
            priority: priority,
            version: version);

    test('place별 userIds·우선순위 합·최대를 집계한다', () {
      final d = aggregateWishes([
        row('w1', 'p1', 'me', priority: 2),
        row('w2', 'p1', 'you', priority: 3),
        row('w3', 'p2', 'me'),
      ], 'me');
      expect(d.byPlace['p1']!.userIds, ['me', 'you']);
      expect(d.byPlace['p1']!.totalPriority, 5);
      expect(d.byPlace['p1']!.maxPriority, 3);
      expect(d.byPlace['p2']!.userIds, ['me']);
    });

    test('mine에는 내 행만 — 우선순위 컨트롤에 필요한 version 포함', () {
      final d = aggregateWishes([
        row('w1', 'p1', 'me', priority: 2, version: 7),
        row('w2', 'p1', 'you', priority: 3),
      ], 'me');
      expect(d.mine.keys, ['p1']);
      expect(d.mine['p1']!.wishId, 'w1');
      expect(d.mine['p1']!.version, 7);
      expect(d.mine['p1']!.priority, 2);
    });

    test('myId가 null이면 mine은 비고 byPlace는 그대로', () {
      final d = aggregateWishes([row('w1', 'p1', 'me')], null);
      expect(d.mine, isEmpty);
      expect(d.byPlace, isNotEmpty);
    });

    test('같은 user 중복 행은 userIds에 한 번만(웹판과 동일)', () {
      final d = aggregateWishes([
        row('w1', 'p1', 'me', priority: 1),
        row('w2', 'p1', 'me', priority: 2),
      ], 'me');
      expect(d.byPlace['p1']!.userIds, ['me']);
      expect(d.byPlace['p1']!.totalPriority, 3); // 합은 행 기준(웹판 동일)
    });
  });

  group('interpretRows — 낙관적 락의 심장', () {
    test('0행 = 충돌 (LWW 무음 덮어쓰기 금지 §4.3)', () {
      expect(interpretRows(<Map<String, dynamic>>[]),
          isA<VersionedConflict<Map<String, dynamic>>>());
    });

    test('1행 = 성공, 그 행을 돌려준다', () {
      final r = interpretRows([
        {'id': 'x', 'version': 2},
      ]);
      expect(r, isA<VersionedOk<Map<String, dynamic>>>());
      expect((r as VersionedOk<Map<String, dynamic>>).row['version'], 2);
    });
  });
}
