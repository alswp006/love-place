import 'package:flutter_test/flutter_test.dart';

import 'package:weave/places/place_row.dart';
import 'package:weave/places/region_clusters.dart';
import 'package:weave/places/search_saved.dart';

/// 담은 장소 '다시 찾기' — 장소가 쌓일 때 가장 먼저 무너지는 지점이 렌더 성능이 아니라
/// 찾기였다(웹판에서 확인). 매칭 규칙이 곧 UX라 여기서 못박는다.
PlaceRow _p(String id, String name,
        {String? address, String? region, String? category}) =>
    PlaceRow(
      id: id,
      name: name,
      address: address,
      regionLabel: region,
      lat: 38,
      lng: 128,
      category: category,
      kakaoPlaceId: 'k-$id',
      addedBy: 'u1',
      version: 1,
    );

final _places = [
  _p('p1', '칠성조선소',
      address: '강원 속초시 중앙로', region: '속초', category: '카페'),
  _p('p2', '아바이마을', address: '강원 속초시 청호동', region: '속초', category: '관광'),
  _p('p3', '속초해수욕장', address: '강원 속초시 조양동', region: '속초', category: '관광'),
  _p('p4', '안목해변', address: '강원 강릉시 창해로', region: '강릉', category: '카페'),
  _p('p5', 'Blue Bottle', address: '서울 성동구', region: '서울', category: '카페'),
];

void main() {
  group('matchesQuery', () {
    test('이름 부분 일치', () {
      expect(matchesQuery(_places[0], '조선소'), isTrue);
      expect(matchesQuery(_places[0], '아바이'), isFalse);
    });

    test('★ 지역으로도 찾힌다 — 이름에 "속초"가 없는 곳도 나와야 한다', () {
      // 사람이 기대하는 결과. 이름만 보면 칠성조선소가 '속초' 검색에서 빠진다.
      expect(matchesQuery(_places[0], '속초'), isTrue);
    });

    test('카테고리·주소로도 찾힌다', () {
      expect(matchesQuery(_places[0], '카페'), isTrue);
      expect(matchesQuery(_places[1], '카페'), isFalse);
      expect(matchesQuery(_places[1], '청호동'), isTrue);
    });

    test('대소문자·연속 공백을 무시한다', () {
      expect(matchesQuery(_places[4], 'blue'), isTrue);
      expect(matchesQuery(_places[4], '  BLUE   BOTTLE '), isTrue);
    });

    test('빈 질의는 거르지 않는다 — 검색창이 비었을 때 목록이 사라지면 안 된다', () {
      expect(matchesQuery(_places[0], ''), isTrue);
      expect(matchesQuery(_places[0], '   '), isTrue);
    });

    test('null 필드가 있어도 터지지 않는다', () {
      expect(matchesQuery(_p('x', '이름만'), '이름'), isTrue);
      expect(matchesQuery(_p('x', '이름만'), '없는말'), isFalse);
    });
  });

  group('filterSaved — 상태와 질의는 곱해진다', () {
    final visited = {'p2', 'p4'};

    List<String> ids(List<PlaceRow> l) => l.map((p) => p.id).toList();

    test('가고싶음 = 방문 기록 없는 것', () {
      expect(
        ids(filterSaved(_places,
            status: StatusFilter.wish, query: '', visitedIds: visited)),
        ['p1', 'p3', 'p5'],
      );
    });

    test('가봤음 = 방문 기록 있는 것', () {
      expect(
        ids(filterSaved(_places,
            status: StatusFilter.visited, query: '', visitedIds: visited)),
        ['p2', 'p4'],
      );
    });

    test('★ "가본 곳 중에 속초" — 두 축이 곱해진다', () {
      // 지도 시트의 배타 구조로는 표현할 수 없던 질의다.
      expect(
        ids(filterSaved(_places,
            status: StatusFilter.visited, query: '속초', visitedIds: visited)),
        ['p2'],
      );
    });

    test('교차 결과가 비면 빈 목록(부분 빈 상태가 받는다)', () {
      expect(
        filterSaved(_places,
            status: StatusFilter.wish, query: '강릉', visitedIds: visited),
        isEmpty,
      );
    });

    test('원본 순서를 보존한다(정렬은 호출측 책임)', () {
      expect(
        ids(filterSaved(_places,
            status: StatusFilter.all, query: '카페', visitedIds: visited)),
        ['p1', 'p4', 'p5'],
      );
    });
  });

  group('regionClusters', () {
    test('지역별로 묶고 개수 내림차순 — 많이 모인 곳이 다음 여행지다', () {
      final c = regionClusters(_places);
      expect(c.first.label, '속초');
      expect(c.first.count, 3);
      expect(c.map((x) => x.label), ['속초', '강릉', '서울']);
    });

    test('★ 임계치를 넘겨야 ready — 코스 CTA를 가르는 값', () {
      final c = regionClusters(_places);
      expect(c.firstWhere((x) => x.label == '속초').ready, isTrue);
      expect(c.firstWhere((x) => x.label == '강릉').ready, isFalse);
    });

    test('지역이 없으면 기타로 묶는다(빠뜨리지 않는다)', () {
      final c = regionClusters([_p('x', '어딘가')]);
      expect(c.single.label, '기타');
    });

    test('개수가 같으면 라벨 순 — 갱신마다 목록이 요동치면 안 된다', () {
      final c = regionClusters([
        _p('a', 'A', region: '하남'),
        _p('b', 'B', region: '가평'),
      ]);
      expect(c.map((x) => x.label), ['가평', '하남']);
    });

    test('빈 목록이면 빈 결과', () {
      expect(regionClusters(const []), isEmpty);
    });
  });
}
