import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:weave/map/map_screen.dart';
import 'package:weave/search/place_hit.dart';
import 'package:weave/search/search_controller.dart';

// 위시 저장 ≤3탭 회귀 테스트(ux §3, CLAUDE.md §1 — 원칙 흐름).
// 검색 입력 탭(1) → 후보 탭(2) → 저장 탭(3). 3탭을 넘기면 이 테스트가 깨져야 한다.
//
// 테스트 빌드는 네이버/supabase 미설정 — MapView는 폴백을 그리고 검색은 fetch 주입.
void main() {
  const hit = PlaceHit(
    kakaoPlaceId: '망원한강공원|서울 마포구',
    name: '망원한강공원',
    address: '서울 마포구 마포나루길 467',
    lat: 37.5556,
    lng: 126.8958,
    category: '공원',
  );

  testWidgets('검색 입력 → 후보 탭 → 저장: 정확히 3탭', (tester) async {
    final savedHits = <PlaceHit>[];
    final search =
        PlaceSearchController(fetch: (q) async => [hit]);
    addTearDown(search.dispose);

    await tester.pumpWidget(MaterialApp(
      home: MapScreen(
        places: const [],
        searchController: search,
        onSaveHit: (h) async {
          savedHits.add(h);
          return (placeId: 'p-new', jumped: false);
        },
      ),
    ));

    // 탭 1: 검색 입력.
    await tester.tap(find.byType(TextField));
    await tester.pump();
    await tester.enterText(find.byType(TextField), '망원');
    // 디바운스(250ms) + 응답 반영.
    await tester.pump(searchDebounce + const Duration(milliseconds: 50));
    await tester.pump();
    expect(find.text('망원한강공원'), findsOneWidget);

    // 탭 2: 후보 탭 → 프리뷰 시트가 뜬다.
    await tester.tap(find.text('망원한강공원').first);
    await tester.pumpAndSettle();
    expect(find.text('가고싶은 곳으로 저장'), findsOneWidget);

    // 탭 3: 저장.
    await tester.tap(find.text('가고싶은 곳으로 저장'));
    await tester.pumpAndSettle();

    expect(savedHits, hasLength(1));
    expect(savedHits.single.kakaoPlaceId, hit.kakaoPlaceId);
    // 저장 후 프리뷰 시트가 실카드 선택으로 전환(저장 버튼은 사라진다).
    expect(find.text('가고싶은 곳으로 저장'), findsNothing);
  });

  testWidgets('저장 실패 → 인라인 에러 + 시트 유지(입력 보존, ux §7)', (tester) async {
    final search = PlaceSearchController(fetch: (q) async => [hit]);
    addTearDown(search.dispose);

    await tester.pumpWidget(MaterialApp(
      home: MapScreen(
        places: const [],
        searchController: search,
        onSaveHit: (_) async => throw Exception('network'),
      ),
    ));

    await tester.enterText(find.byType(TextField), '망원');
    await tester.pump(searchDebounce + const Duration(milliseconds: 50));
    await tester.pump();
    await tester.tap(find.text('망원한강공원').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('가고싶은 곳으로 저장'));
    await tester.pumpAndSettle();

    expect(find.text('저장에 실패했어요. 다시 시도해주세요.'), findsOneWidget);
    // 시트가 닫히지 않았다 — 재시도 가능.
    expect(find.text('가고싶은 곳으로 저장'), findsOneWidget);
  });

  testWidgets('빈 결과 → 죽은 화면이 아니라 안내 문구(다층 빈 상태)', (tester) async {
    final search = PlaceSearchController(fetch: (q) async => []);
    addTearDown(search.dispose);

    await tester.pumpWidget(MaterialApp(
      home: MapScreen(places: const [], searchController: search),
    ));
    await tester.enterText(find.byType(TextField), '없는곳');
    await tester.pump(searchDebounce + const Duration(milliseconds: 50));
    await tester.pump();
    expect(find.text('검색 결과가 없어요. 다른 이름으로 찾아볼까요?'), findsOneWidget);
  });
}
