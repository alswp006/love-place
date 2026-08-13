import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:weave/search/place_hit.dart';
import 'package:weave/search/search_controller.dart';

PlaceHit _hit(String name) => PlaceHit(
      kakaoPlaceId: '$name|주소',
      name: name,
      address: '주소',
      lat: 37.5,
      lng: 127.0,
      category: '',
    );

void main() {
  test('디바운스 — 연타 중엔 한 번만 호출된다(250ms)', () async {
    final calls = <String>[];
    final c = PlaceSearchController(fetch: (q) async {
      calls.add(q);
      return [_hit(q)];
    });
    addTearDown(c.dispose);

    c.setQuery('망');
    c.setQuery('망원');
    c.setQuery('망원한강');
    await Future<void>.delayed(searchDebounce + const Duration(milliseconds: 80));
    expect(calls, ['망원한강']); // 마지막 입력만
    expect(c.hits.single.name, '망원한강');
  });

  test('stale 가드 — 늦게 도착한 옛 응답은 버린다(웹판 seq 가드)', () async {
    final gates = <String, Completer<void>>{
      '느림': Completer(),
      '빠름': Completer(),
    };
    final c = PlaceSearchController(fetch: (q) async {
      await gates[q]!.future;
      return [_hit(q)];
    });
    addTearDown(c.dispose);

    c.setQuery('느림');
    await Future<void>.delayed(searchDebounce + const Duration(milliseconds: 30));
    c.setQuery('빠름');
    await Future<void>.delayed(searchDebounce + const Duration(milliseconds: 30));

    // 새 요청이 먼저 완료되고, 옛 요청이 늦게 도착한다.
    gates['빠름']!.complete();
    await Future<void>.delayed(const Duration(milliseconds: 20));
    gates['느림']!.complete();
    await Future<void>.delayed(const Duration(milliseconds: 20));

    expect(c.hits.single.name, '빠름'); // 옛 응답이 덮어쓰지 못한다
    expect(c.status, SearchStatus.done);
  });

  test('빈 질의 → idle로 복귀(호출 없음)', () async {
    var called = 0;
    final c = PlaceSearchController(fetch: (q) async {
      called++;
      return [];
    });
    addTearDown(c.dispose);
    c.setQuery('  ');
    await Future<void>.delayed(searchDebounce + const Duration(milliseconds: 30));
    expect(called, 0);
    expect(c.status, SearchStatus.idle);
  });

  test('clear는 비행 중 응답도 무효화한다', () async {
    final gate = Completer<void>();
    final c = PlaceSearchController(fetch: (q) async {
      await gate.future;
      return [_hit(q)];
    });
    addTearDown(c.dispose);
    c.setQuery('취소될검색');
    await Future<void>.delayed(searchDebounce + const Duration(milliseconds: 30));
    c.clear();
    gate.complete();
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(c.hits, isEmpty);
    expect(c.status, SearchStatus.idle);
  });

  test('에러 → 사용자 메시지(원인 노출은 프록시 구조화 메시지가)', () async {
    final c = PlaceSearchController(fetch: (q) async => throw Exception('x'));
    addTearDown(c.dispose);
    c.setQuery('실패');
    await Future<void>.delayed(searchDebounce + const Duration(milliseconds: 30));
    expect(c.status, SearchStatus.error);
    expect(c.error, isNotNull);
  });
}
