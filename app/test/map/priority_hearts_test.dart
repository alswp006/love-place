import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:weave/map/map_screen.dart';
import 'package:weave/map/map_view.dart';
import 'package:weave/places/wish_aggregate.dart';

// 우선순위 하트(위시 의도의 세기) — 시트에서 탭하면 cyclePriority로 다음 단계를
// 보낸다. expectedVersion이 함께 실리는지(낙관적 락 §4.3)까지 고정한다.
void main() {
  const place = MapPlace(
      id: 'p1', name: '카페', lat: 37.5, lng: 127.0, bothWished: false);

  Future<void> pumpWithWish(
    WidgetTester tester, {
    required MyWish wish,
    required List<
            ({String wishId, int expectedVersion, int priority})>
        calls,
  }) async {
    await tester.pumpWidget(MaterialApp(
      home: MapScreen(
        places: const [place],
        myWishOf: (_) => wish,
        onSetPriority: (
            {required wishId,
            required expectedVersion,
            required priority}) async {
          calls.add((
            wishId: wishId,
            expectedVersion: expectedVersion,
            priority: priority
          ));
        },
      ),
    ));
  }

  testWidgets('하트 탭 → 다음 단계 + version 동반(1→2)', (tester) async {
    final calls =
        <({String wishId, int expectedVersion, int priority})>[];
    await pumpWithWish(tester,
        wish: const MyWish(wishId: 'w1', priority: 1, version: 7),
        calls: calls);

    // 시트를 연다(마커 대신 지도 폴백 화면이라 직접 선택 경로가 없음 →
    // MapScreen 내부 상태를 흉내내기 위해 장소 선택을 트리거할 수 없으므로,
    // 여기서는 시트가 열린 상태를 만들기 위해 select를 호출하는 대신
    // 하트 컨트롤이 시트에 있음을 전제로 마커 탭과 동일한 _select 경로를
    // 검증하는 것은 실기기 몫으로 두고, 하트 표시·콜백 계약만 본다.
    final state =
        tester.state<State<MapScreen>>(find.byType(MapScreen));
    // ignore: avoid_dynamic_calls
    (state as dynamic).debugSelectForTest('p1');
    await tester.pumpAndSettle();

    expect(find.text('1/3'), findsOneWidget);
    await tester.tap(find.text('1/3'));
    await tester.pumpAndSettle();

    expect(calls.single.wishId, 'w1');
    expect(calls.single.expectedVersion, 7);
    expect(calls.single.priority, 2); // cyclePriority(1)
  });

  testWidgets('3단계에서 탭 → 0으로 순환', (tester) async {
    final calls =
        <({String wishId, int expectedVersion, int priority})>[];
    await pumpWithWish(tester,
        wish: const MyWish(wishId: 'w1', priority: 3, version: 2),
        calls: calls);
    final state =
        tester.state<State<MapScreen>>(find.byType(MapScreen));
    // ignore: avoid_dynamic_calls
    (state as dynamic).debugSelectForTest('p1');
    await tester.pumpAndSettle();

    await tester.tap(find.text('3/3'));
    await tester.pumpAndSettle();
    expect(calls.single.priority, 0);
  });
}
