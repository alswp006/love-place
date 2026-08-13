import 'package:flutter_test/flutter_test.dart';
import 'package:weave/map/map_focus.dart';
import 'package:weave/map/sheet_snap.dart';

void main() {
  const h = 800.0; // 뷰포트 높이
  const peek = 144.0; // peek 정지 시 노출 콘텐츠

  group('sheetOcclusionPx', () {
    test('시트가 닫혀 있으면 가림 0 — 지도가 화면 전체를 쓴다', () {
      expect(
        sheetOcclusionPx(
          sheetOpen: false,
          snap: SnapStop.half,
          viewportHeight: h,
          peekPx: peek,
        ),
        0,
      );
    });

    test('peek는 콘텐츠 px만 가린다(비율이 아니라)', () {
      expect(
        sheetOcclusionPx(
          sheetOpen: true,
          snap: SnapStop.peek,
          viewportHeight: h,
          peekPx: peek,
        ),
        peek,
      );
    });

    test('half는 뷰포트의 50%를 가린다', () {
      expect(
        sheetOcclusionPx(
          sheetOpen: true,
          snap: SnapStop.half,
          viewportHeight: h,
          peekPx: peek,
        ),
        400,
      );
    });

    test('full(92%)은 75%로 클램프된다 — 논리 뷰포트가 0이 되면 fitBounds가 발산한다', () {
      final occ = sheetOcclusionPx(
        sheetOpen: true,
        snap: SnapStop.full,
        viewportHeight: h,
        peekPx: peek,
      );
      expect(occ, 600); // 800*0.92=736 이 아니라 800*0.75=600
      expect(visibleMapHeight(viewportHeight: h, occlusionPx: occ), 200);
    });

    test('뷰포트 높이가 0이면(레이아웃 전) 0 — 0으로 나누지 않는다', () {
      expect(
        sheetOcclusionPx(
          sheetOpen: true,
          snap: SnapStop.half,
          viewportHeight: 0,
          peekPx: peek,
        ),
        0,
      );
    });
  });

  group('웹판 회귀 — 핀을 누르면 시트 뒤로 숨던 것', () {
    // 웹판: map.panTo(marker.position) → 마커가 뷰포트 정중앙(y=400)에 온다.
    // 그런데 선택과 동시에 시트가 half(하단 400px)로 올라오므로 마커는 정확히
    // 시트 경계선(y=400)에 걸린다. full이면 아예 안 보인다.
    test('half에서 보정 없이 중앙에 놓으면 마커가 시트 경계에 걸린다', () {
      const occ = 400.0; // half
      const naiveY = h / 2; // 웹판 panTo가 놓는 위치
      final sheetTopY = h - occ;
      expect(naiveY, sheetTopY); // 400 == 400 — 경계선에 정확히 걸림
    });

    test('보정하면 마커가 가시영역 중앙에 온다', () {
      const occ = 400.0;
      final visible = visibleMapHeight(viewportHeight: h, occlusionPx: occ);
      final wantY = visible / 2; // 가시영역(0..400)의 중앙 = 200
      final correctedY = h / 2 - focusCenterOffsetPx(occlusionPx: occ);
      expect(correctedY, wantY); // 400 - 200 = 200 ✓
      expect(correctedY < h - occ, isTrue); // 시트 위에 확실히 있다
    });

    test('full에서도 마커가 시트 위에 남는다', () {
      final occ = sheetOcclusionPx(
        sheetOpen: true,
        snap: SnapStop.full,
        viewportHeight: h,
        peekPx: peek,
      );
      final correctedY = h / 2 - focusCenterOffsetPx(occlusionPx: occ);
      expect(correctedY, 100); // 400 - 300
      expect(correctedY < h - occ, isTrue); // 100 < 200 ✓
    });

    test('시트가 닫혀 있으면 보정이 0 — 기존 동작과 동일', () {
      expect(focusCenterOffsetPx(occlusionPx: 0), 0);
    });
  });
}
