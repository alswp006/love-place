/// 탭 IA의 **단일 출처** — 웹판 `src/app/tabs.ts`와 같은 규약.
///
/// 왜 한 곳에 모으나: 웹판은 탭 메타가 TabBar·router·페이지 셸·테스트에 흩어져 있다가
/// 무성 회귀를 겪고 이 파일로 통합했다. 탭을 더하거나 뺄 때 고칠 곳이 하나여야 한다.
///
/// **웹판과 다른 점 — 탭이 둘뿐이다.** Flutter 이식은 지도부터 세로로 잘라 올리는 중이라
/// 일정·여행·장소·우리 중 옮긴 것만 노출한다. 빈 탭을 미리 깔면 눌렀을 때 갈 곳이 없다.
/// 웹판 5탭 순서(지도·일정·여행·장소·우리)는 유지하고, 옮긴 것만 앞에서부터 채운다.
library;

import 'package:flutter/material.dart';

class TabDef {
  const TabDef({
    required this.label,
    required this.icon,
    required this.activeIcon,
    required this.testKey,
  });

  /// 하단 탭바 라벨. 아이콘과 **함께** 쓴다 — 아이콘만으로는 뜻이 안 통한다(§8).
  final String label;
  final IconData icon;

  /// 선택 상태는 색만으로 말하지 않는다 — 채운 아이콘으로도 갈린다(색각 이상 대응, §8).
  final IconData activeIcon;

  /// 위젯 테스트가 탭을 집는 키. 라벨 문자열에 의존하면 카피가 바뀔 때마다 테스트가 깨진다.
  final String testKey;
}

const tabs = <TabDef>[
  TabDef(
    label: '지도',
    icon: Icons.map_outlined,
    activeIcon: Icons.map,
    testKey: 'tab-map',
  ),
  TabDef(
    label: '일정',
    icon: Icons.calendar_today_outlined,
    activeIcon: Icons.calendar_today,
    testKey: 'tab-calendar',
  ),
  TabDef(
    label: '여행',
    icon: Icons.luggage_outlined,
    activeIcon: Icons.luggage,
    testKey: 'tab-trips',
  ),
  TabDef(
    label: '장소',
    icon: Icons.bookmark_border,
    activeIcon: Icons.bookmark,
    testKey: 'tab-places',
  ),
  TabDef(
    label: '우리',
    icon: Icons.people_outline,
    activeIcon: Icons.people,
    testKey: 'tab-us',
  ),
];
