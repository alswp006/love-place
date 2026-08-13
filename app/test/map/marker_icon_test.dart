import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:weave/map/marker_diff.dart';
import 'package:weave/map/marker_icon.dart';
import 'package:weave/places/marker_visual.dart';

MarkerSpec _spec({
  String glyph = '☆',
  MarkerKind kind = MarkerKind.wish,
  bool selected = false,
  String? badge,
  int? order,
  int? clusterCount,
}) =>
    MarkerSpec(
      key: 'k',
      lat: 37.5,
      lng: 127.0,
      glyph: glyph,
      kind: kind,
      label: 'k',
      zIndex: selected ? selectedZIndex : baseZIndex,
      selected: selected,
      badge: badge,
      order: order,
      clusterCount: clusterCount,
    );

void main() {
  group('iconKeyOf — 변형당 캐시 1개', () {
    test('같은 변형은 같은 키(마커 수백 개 → 이미지 몇 개)', () {
      expect(
        iconKeyOf(_spec(), Brightness.light),
        iconKeyOf(_spec(), Brightness.light),
      );
    });

    test('선택·kind·다크·순번은 각각 다른 키', () {
      final base = iconKeyOf(_spec(), Brightness.light);
      expect(iconKeyOf(_spec(selected: true), Brightness.light),
          isNot(base));
      expect(
          iconKeyOf(_spec(kind: MarkerKind.visited, glyph: '★'),
              Brightness.light),
          isNot(base));
      expect(iconKeyOf(_spec(), Brightness.dark), isNot(base));
      expect(iconKeyOf(_spec(order: 2), Brightness.light), isNot(base));
    });
  });

  group('PinIcon 렌더 — 색+모양 이중화(§8)', () {
    testWidgets('글리프가 그려진다', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: PinIcon(spec: _spec(glyph: '✦'), brightness: Brightness.light),
      ));
      expect(find.text('✦'), findsOneWidget);
    });

    testWidgets('가봤음 배지 ✓가 함께 그려진다', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: PinIcon(
          spec: _spec(glyph: '★', kind: MarkerKind.visited, badge: '✓'),
          brightness: Brightness.light,
        ),
      ));
      expect(find.text('★'), findsOneWidget);
      expect(find.text('✓'), findsOneWidget);
    });

    testWidgets('순번이 있으면 글리프 대신 숫자를 그린다(트리플식)', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: PinIcon(spec: _spec(order: 3), brightness: Brightness.light),
      ));
      expect(find.text('3'), findsOneWidget);
      expect(find.text('☆'), findsNothing);
    });

    test('kind별 핀 색이 라이트/다크 모두 서로 다르다', () {
      for (final b in Brightness.values) {
        final colors = MarkerKind.values
            .map((k) => MarkerPalette.pinColor(k, b))
            .toSet();
        expect(colors.length, MarkerKind.values.length);
      }
    });
  });

  group('ClusterIcon', () {
    testWidgets('개수 텍스트 이중화(§8)', (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: ClusterIcon(count: 7, brightness: Brightness.light),
      ));
      expect(find.text('7'), findsOneWidget);
    });
  });
}
