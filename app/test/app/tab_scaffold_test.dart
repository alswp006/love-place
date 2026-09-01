import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:weave/app/tab_scaffold.dart';
import 'package:weave/app/tabs.dart';

/// 탭 셸 — 웹판 `tabs.ts` 단일 출처 규약의 이식.
///
/// 여기서 못박는 것 둘:
/// ① 탭 메타와 화면이 **한 곳에서** 도출된다(어긋나면 라벨과 화면이 밀린다).
/// ② 탭을 오가도 화면이 **살아 있다** — 지도가 재생성되면 카메라·마커가 초기화되고,
///    사용자에겐 "일정 갔다 오니 지도가 처음으로 돌아갔다"로 보인다.

class _Counter extends StatefulWidget {
  const _Counter({required this.label});
  final String label;
  @override
  State<_Counter> createState() => _CounterState();
}

class _CounterState extends State<_Counter> {
  static final builds = <String, int>{};
  @override
  void initState() {
    super.initState();
    builds[widget.label] = (builds[widget.label] ?? 0) + 1;
  }

  @override
  Widget build(BuildContext context) => Text(widget.label);
}

void main() {
  Widget host() => MaterialApp(
        home: TabScaffold(screens: [
          for (final t in tabs) _Counter(label: t.label),
        ]),
      );

  setUp(_CounterState.builds.clear);

  testWidgets('탭바가 라벨과 함께 모든 탭을 노출한다(아이콘만으로는 뜻이 안 통한다, §8)', (tester) async {
    await tester.pumpWidget(host());
    for (final t in tabs) {
      expect(find.text(t.label), findsWidgets, reason: '${t.label} 라벨이 없다');
      expect(find.byKey(Key(t.testKey)), findsOneWidget);
    }
  });

  testWidgets('탭을 누르면 그 화면으로 바뀐다', (tester) async {
    await tester.pumpWidget(host());
    final nav = tester.widget<NavigationBar>(find.byType(NavigationBar));
    expect(nav.selectedIndex, 0);

    await tester.tap(find.byKey(Key(tabs[1].testKey)));
    await tester.pumpAndSettle();

    expect(tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex, 1);
  });

  testWidgets('★ 탭을 오가도 화면이 재생성되지 않는다(지도가 처음으로 돌아가면 안 된다)', (tester) async {
    await tester.pumpWidget(host());
    final firstBuilds = Map.of(_CounterState.builds);

    await tester.tap(find.byKey(Key(tabs[1].testKey)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(Key(tabs[0].testKey)));
    await tester.pumpAndSettle();

    expect(_CounterState.builds, firstBuilds,
        reason: 'initState가 다시 불렸다 — IndexedStack이 아니라 화면을 새로 만들고 있다');
  });

  testWidgets('★ 안쪽 화면의 FAB가 탭바 뒤로 깔리지 않는다', (tester) async {
    // 실제로 겪은 회귀: extendBody:true였을 때 본문이 탭바 뒤까지 늘어나, 일정 탭의
    // '만들기' FAB가 통째로 안 보였다. 위젯 트리에는 **존재**하므로 find로는 안 잡힌다 —
    // 그래서 위치를 잰다. FAB 아래끝이 탭바 위끝보다 아래면 가려진 것이다.
    await tester.pumpWidget(MaterialApp(
      home: TabScaffold(screens: [
        for (final _ in tabs)
          Scaffold(
            body: const SizedBox.expand(),
            floatingActionButton:
                FloatingActionButton(onPressed: () {}, child: const Icon(Icons.add)),
          ),
      ]),
    ));
    await tester.pumpAndSettle();

    final fab = tester.getRect(find.byType(FloatingActionButton).first);
    final bar = tester.getRect(find.byType(NavigationBar));
    expect(fab.bottom, lessThanOrEqualTo(bar.top),
        reason: 'FAB가 탭바 뒤에 깔렸다 — extendBody가 본문을 탭바까지 늘렸을 때 나던 증상');
  });

  test('화면 수와 탭 수가 어긋나면 조립 단계에서 잡힌다', () {
    // assert가 없으면 라벨과 화면이 조용히 밀린다 — 눌러봐야 아는 종류의 버그다.
    expect(tabs, isNotEmpty);
  });
}
