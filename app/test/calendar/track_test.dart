import 'dart:math' as math;
import 'dart:ui' show Brightness, Color;

import 'package:flutter_test/flutter_test.dart';
import 'package:weave/calendar/track.dart';

/// 트랙 도출 — 웹판 `src/__tests__/calendar.test.ts`의 `deriveTrack` 블록 이식 + 보강.
///
/// 여기가 지키는 건 하나다: **두 단말이 같은 규칙으로, 각자의 답을 낸다.**
/// 같은 이벤트에 두 사람이 다른 색을 보는 게 버그가 아니라 계약이다.
void main() {
  const me = 'me-uuid';
  const partner = 'partner-uuid';

  group('deriveTrack (색 도출 — 두 단말 일치)', () {
    // ── 웹판에서 그대로 옮긴 3케이스 ──
    test('SHARED는 누가 봐도 함께(shared)', () {
      expect(
        deriveTrack(visibility: 'SHARED', ownerId: me, myId: me),
        Track.shared,
      );
      expect(
        deriveTrack(visibility: 'SHARED', ownerId: me, myId: partner),
        Track.shared,
      );
    });

    test('PERSONAL은 보는 사람 기준: 내 것=mine, 상대 것=partner', () {
      expect(
        deriveTrack(visibility: 'PERSONAL', ownerId: me, myId: me),
        Track.mine, // 내 화면
      );
      expect(
        deriveTrack(visibility: 'PERSONAL', ownerId: me, myId: partner),
        Track.partner, // 상대 화면
      );
    });

    test('myId 미상이면 PERSONAL은 partner로 안전 도출', () {
      expect(
        deriveTrack(visibility: 'PERSONAL', ownerId: me, myId: null),
        Track.partner,
      );
    });

    // ── 보강 ──
    test('★ 같은 행을 두 사람이 봐도 SHARED는 안 갈리고 PERSONAL만 뒤집힌다', () {
      // 이식하면서 가장 깨지기 쉬운 지점. owner를 고정하고 viewer만 바꿔 대칭을 확인한다.
      for (final owner in [me, partner]) {
        expect(
          deriveTrack(visibility: 'SHARED', ownerId: owner, myId: me),
          deriveTrack(visibility: 'SHARED', ownerId: owner, myId: partner),
          reason: 'SHARED는 viewer와 무관해야 한다',
        );
        final asOwner = deriveTrack(
          visibility: 'PERSONAL',
          ownerId: owner,
          myId: owner,
        );
        final asOther = deriveTrack(
          visibility: 'PERSONAL',
          ownerId: owner,
          myId: owner == me ? partner : me,
        );
        expect(asOwner, Track.mine);
        expect(asOther, Track.partner);
      }
    });

    test('SHARED는 myId를 몰라도 shared — 안전 도출이 SHARED를 먹지 않는다', () {
      expect(
        deriveTrack(visibility: 'SHARED', ownerId: me, myId: null),
        Track.shared,
      );
    });

    test('모르는 visibility 값은 던지지 않고 PERSONAL 경로로 간다', () {
      // 캘린더 렌더링이 값 하나로 죽으면 안 되고, 소유자 기준이 shared로 넓게 칠하는 것보다
      // 보수적이다. 웹판 `if (=== 'SHARED') ... else ...`와 동일한 분기.
      expect(
        deriveTrack(visibility: 'personal', ownerId: me, myId: me),
        Track.mine, // 소문자여도 SHARED가 아니므로 PERSONAL 경로
      );
      expect(
        deriveTrack(visibility: '', ownerId: me, myId: partner),
        Track.partner,
      );
    });

    test('저장값 상수가 웹판 DB 열거형 문자열 그대로', () {
      // 이 두 글자가 바뀌면 웹판이 만든 행을 Flutter가 다른 트랙으로 칠한다.
      expect(EventVisibility.shared, 'SHARED');
      expect(EventVisibility.personal, 'PERSONAL');
      expect(
        deriveTrack(visibility: EventVisibility.shared, ownerId: me, myId: me),
        Track.shared,
      );
    });
  });

  group('트랙 메타 (§8 색 단독 구분 금지)', () {
    test('Track.values 순서 = 웹판 ALL_TRACKS 순서 — 칩이 놓이는 순서다', () {
      expect(Track.values, [Track.shared, Track.mine, Track.partner]);
    });

    test('세 트랙 모두 라벨이 있고 서로 다르다 — 색을 빼도 구분된다', () {
      final labels = [for (final t in Track.values) t.label];
      expect(labels, ['함께', '나', '상대']); // 웹판 TRACK_META와 같은 문구
      expect(labels.toSet().length, 3);
      expect(labels.every((l) => l.trim().isNotEmpty), isTrue);
    });
  });

  group('trackColor (런타임 도출 — 저장 아님)', () {
    test('밝기별로 세 색이 서로 다르고, 같은 트랙도 밝기 따라 갈린다', () {
      for (final b in Brightness.values) {
        final colors = [for (final t in Track.values) trackColor(t, b)];
        expect(colors.toSet().length, 3, reason: '$b에서 트랙 색이 겹친다');
      }
      for (final t in Track.values) {
        expect(
          trackColor(t, Brightness.light),
          isNot(trackColor(t, Brightness.dark)),
          reason: '$t의 다크 대응색이 없다',
        );
      }
    });

    // 웹판 `tokensContrast.test.ts`의 트랙 대비 케이스 이식.
    // 하드코딩한 hex가 '웹 토큰의 정확한 변환'이라는 주장을 실제로 검증하는 유일한 방법이다 —
    // 숫자만 비교하면 오타난 숫자끼리도 통과한다.
    // 배경은 웹 --surface: 라이트 oklch(100% 0 0), 다크 oklch(21% .014 340).
    const surfaces = {
      Brightness.light: Color(0xFFFFFFFF),
      Brightness.dark: Color(0xFF1D161A),
    };
    surfaces.forEach((brightness, surface) {
      final name = brightness == Brightness.light ? '라이트' : '다크';

      test('$name: 트랙 3색이 표면 위에서 본문 대비(4.5:1)를 넘는다', () {
        for (final t in Track.values) {
          final r = _contrastRatio(trackColor(t, brightness), surface);
          expect(
            r,
            greaterThanOrEqualTo(4.5),
            reason: '$t = ${r.toStringAsFixed(2)}:1',
          );
        }
      });

      test('$name: 3색이 같은 대비대 — 색조만 다르고 읽힘은 같아야 한다', () {
        // OKLCH로 토큰을 잡은 이유가 이거다. 편차가 벌어지면 한 트랙만 흐리게 보인다.
        final ratios = [
          for (final t in Track.values)
            _contrastRatio(trackColor(t, brightness), surface),
        ];
        expect(
          ratios.reduce(math.max) - ratios.reduce(math.min),
          lessThan(1.5),
        );
      });
    });
  });
}

// WCAG 2.1 상대휘도·대비비. 웹판 `src/lib/a11y/contrast.ts`와 같은 식.
double _channel(double c) =>
    c <= 0.03928 ? c / 12.92 : math.pow((c + 0.055) / 1.055, 2.4).toDouble();

double _luminance(Color c) {
  final v = c.toARGB32();
  return 0.2126 * _channel(((v >> 16) & 0xFF) / 255) +
      0.7152 * _channel(((v >> 8) & 0xFF) / 255) +
      0.0722 * _channel((v & 0xFF) / 255);
}

double _contrastRatio(Color a, Color b) {
  final la = _luminance(a), lb = _luminance(b);
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}
