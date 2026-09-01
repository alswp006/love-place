/// 탭 셸 — 하단 탭바 + 화면 유지.
///
/// ## IndexedStack을 쓰는 이유
///
/// 탭을 오갈 때마다 지도를 새로 만들면 네이티브 뷰가 재생성되고 카메라·마커가 초기화된다.
/// 사용자에겐 "일정 갔다 오니 지도가 처음으로 돌아갔다"로 보인다. IndexedStack은 화면을
/// 살려둔 채 보이는 것만 바꾼다.
///
/// 대가: 두 화면이 동시에 살아 있으므로 Realtime 구독·타이머가 겹칠 수 있다. 그래서 구독은
/// 각 탭이 아니라 **여기 위(AppShell)에서 한 번만** 잡는 것을 규약으로 둔다.
///
/// ## 접근성
///
/// 라벨을 항상 보여준다(`showUnselectedLabels`). 아이콘만 있으면 뜻이 안 통하고, 선택 상태를
/// 색으로만 말하지 않으려면 채운/빈 아이콘 + 라벨이 함께 있어야 한다(§8 색 단독 구분 금지).
library;

import 'package:flutter/material.dart';

import 'tabs.dart';

class TabScaffold extends StatefulWidget {
  const TabScaffold({super.key, required this.screens});

  /// [tabs]와 **같은 순서·같은 길이**여야 한다. 어긋나면 라벨과 화면이 밀린다.
  final List<Widget> screens;

  @override
  State<TabScaffold> createState() => _TabScaffoldState();
}

class _TabScaffoldState extends State<TabScaffold> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    assert(widget.screens.length == tabs.length,
        '화면 수(${widget.screens.length})와 탭 수(${tabs.length})가 다르다 — tabs.dart가 단일 출처다');

    return Scaffold(
      // extendBody는 쓰지 않는다.
      //
      // 처음엔 지도가 탭바 뒤까지 그려지는 '떠 있는 크롬' 결을 노렸는데, 두 가지가 어긋났다:
      // ① Material 3의 NavigationBar는 기본이 불투명이라 비치는 효과가 애초에 없다.
      // ② 본문이 탭바 뒤까지 늘어나면 **안쪽 화면의 FloatingActionButton이 탭바 뒤로 깔린다**.
      //    실제로 일정 탭의 '만들기' 버튼이 통째로 사라져 있었다(시뮬레이터에서 확인).
      // 얻는 것이 없고 잃는 것이 분명해서 걷어냈다.
      body: IndexedStack(index: _index, children: widget.screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        // 라벨 상시 노출 — 아이콘만으로는 뜻이 안 통한다(§8).
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        destinations: [
          for (final t in tabs)
            NavigationDestination(
              key: Key(t.testKey),
              icon: Icon(t.icon),
              selectedIcon: Icon(t.activeIcon),
              label: t.label,
            ),
        ],
      ),
    );
  }
}
