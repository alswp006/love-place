import 'package:flutter_test/flutter_test.dart';
import 'package:weave/places/derive_map_places.dart';
import 'package:weave/places/place_row.dart';
import 'package:weave/places/wish_status.dart';

PlaceRow _place(String id, {double? lat = 37.5, double? lng = 127.0}) =>
    PlaceRow(
      id: id,
      name: '장소$id',
      address: null,
      regionLabel: null,
      lat: lat,
      lng: lng,
      category: null,
      kakaoPlaceId: null,
      addedBy: 'u1',
      version: 1,
    );

void main() {
  group('deriveMapPlaces — 상태는 도출, 저장 아님(§7)', () {
    test('visited = visits 존재, bothWished = 집계 인원 ≥ 2', () {
      final out = deriveMapPlaces(
        places: [_place('a'), _place('b'), _place('c')],
        wishesByPlace: const {
          'a': WishInfo(userIds: ['u1', 'u2']),
          'b': WishInfo(userIds: ['u1']),
        },
        visitedPlaceIds: const {'c'},
      );
      final byId = {for (final p in out) p.id: p};
      expect(byId['a']!.bothWished, isTrue);
      expect(byId['b']!.bothWished, isFalse);
      expect(byId['c']!.visited, isTrue);
      expect(byId['a']!.visited, isFalse);
    });

    test('좌표 없는 장소는 지도에서 제외(웹판 필터와 동일)', () {
      final out = deriveMapPlaces(
        places: [_place('a'), _place('b', lat: null, lng: null)],
        wishesByPlace: const {},
        visitedPlaceIds: const {},
      );
      expect(out.map((p) => p.id), ['a']);
    });

    test('찜·방문 정보가 전혀 없어도 전 장소가 기본 상태로 나온다', () {
      final out = deriveMapPlaces(
        places: [_place('a')],
        wishesByPlace: const {},
        visitedPlaceIds: const {},
      );
      expect(out.single.bothWished, isFalse);
      expect(out.single.visited, isFalse);
    });
  });
}
