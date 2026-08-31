import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:weave/map/map_screen.dart';
import 'package:weave/map/map_view.dart';
import 'package:weave/search/search_controller.dart';

/// 지도는 화면을 가득 채워야 한다 — 시뮬레이터에서 상단 18%만 차지하던 회귀의 방어선.
///
/// 왜 단위 테스트가 이걸 놓쳤나: 기존 테스트는 흐름(탭 수·저장·에러)만 봤고 **크기**를 재지
/// 않았다. 그래서 `flutter test`가 116건 전부 통과하는데도 실기기에서는 지도가 띠처럼 보였다.
///
/// 무엇이 잘못됐었나: `Scaffold`의 body는 **느슨한** 제약(min 0)을 준다. 그 아래 `Stack`은
/// '가장 큰 비(非)positioned 자식'에 맞춰 크기를 정하는데, `_SearchOverlay`가 `SafeArea`를
/// 반환하는 비positioned 자식이라 Stack이 검색바 높이로 주저앉았다. 그러면 그 안의
/// `Positioned.fill(MapView)`도 같이 주저앉는다 — fill은 '부모만큼'이지 '화면만큼'이 아니다.
/// 고침은 `Stack(fit: StackFit.expand)`.
void main() {
  testWidgets('지도가 화면 전체를 채운다(검색바 높이로 주저앉지 않는다)', (tester) async {
    const screen = Size(402, 874); // iPhone 17 Pro 논리 크기
    tester.view.physicalSize = screen * tester.view.devicePixelRatio;
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = screen;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(MaterialApp(
      home: MapScreen(places: const [], searchController: PlaceSearchController()),
    ));

    final mapSize = tester.getSize(find.byType(MapView));

    // 세로가 핵심이다 — 주저앉을 때도 가로는 전부 차지해서 폭만 보면 통과해 버린다.
    expect(mapSize.height, screen.height,
        reason: '지도 높이가 화면보다 작다 — Stack이 비positioned 자식 크기로 주저앉았다');
    expect(mapSize.width, screen.width);
  });
}
