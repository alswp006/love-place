import 'package:flutter_test/flutter_test.dart';
import 'package:weave/places/marker_visual.dart';
import 'package:weave/places/wish_status.dart';

void main() {
  group('deriveWishStatus', () {
    test('아무도 안 찜하면 전부 false/0', () {
      final s = deriveWishStatus(null, 'me');
      expect(s.wishedByMe, isFalse);
      expect(s.wishedByPartner, isFalse);
      expect(s.bothWished, isFalse);
      expect(s.wishCount, 0);
    });

    test('나만 찜', () {
      final s = deriveWishStatus(const WishInfo(userIds: ['me']), 'me');
      expect(s.wishedByMe, isTrue);
      expect(s.wishedByPartner, isFalse);
      expect(s.bothWished, isFalse);
    });

    test('둘 다 찜 = 커플 핵심 신호', () {
      final s = deriveWishStatus(
        const WishInfo(userIds: ['me', 'you']),
        'me',
      );
      expect(s.bothWished, isTrue);
      expect(s.wishCount, 2);
    });

    test('myId 미상이면 상대 것으로 단정하지 않는다', () {
      // 세션 미로딩 중 '나만 찜'이 '상대만 찜'으로 깜빡이는 걸 막는 규칙.
      final s = deriveWishStatus(const WishInfo(userIds: ['me']), null);
      expect(s.wishedByMe, isFalse);
      expect(s.wishedByPartner, isFalse);
    });

    test('myId 미상이어도 bothWished는 인원수로 견고하게 도출', () {
      final s = deriveWishStatus(
        const WishInfo(userIds: ['a', 'b']),
        null,
      );
      expect(s.bothWished, isTrue);
    });
  });

  group('cyclePriority', () {
    test('0→1→2→3→0 순환', () {
      expect(cyclePriority(0), 1);
      expect(cyclePriority(1), 2);
      expect(cyclePriority(2), 3);
      expect(cyclePriority(3), 0);
    });
  });

  group('attachAndSortWishes — Dart의 불안정 정렬을 막는다', () {
    // 웹판은 JS Array.sort의 안정성(ES2019+)에 의존해 "동률이면 최신순 유지"를 얻었다.
    // Dart의 List.sort는 불안정하므로 그대로 옮기면 동률 장소 순서가 조용히 깨진다.
    test('동률이면 입력 순서(최신순)를 유지한다', () {
      final places = List.generate(12, (i) => 'p$i');
      final sorted = attachAndSortWishes<String>(
        places,
        const {}, // 전부 찜 0 = 완전 동률
        'me',
        idOf: (p) => p,
      );
      expect(sorted.map((e) => e.place).toList(), places);
    });

    test('둘 다 찜 → 찜 인원 → 우선순위 합 순으로 정렬', () {
      final sorted = attachAndSortWishes<String>(
        ['plain', 'both', 'mine'],
        const {
          'both': WishInfo(userIds: ['a', 'b'], totalPriority: 1),
          'mine': WishInfo(userIds: ['a'], totalPriority: 3),
        },
        'a',
        idOf: (p) => p,
      );
      expect(sorted.map((e) => e.place).toList(), ['both', 'mine', 'plain']);
    });
  });

  group('markerVisual — 색이 아니라 모양으로 구분(§8 색각 이상 대응)', () {
    test('가봤음이 가장 높은 우선순위', () {
      final v = markerVisual(visited: true, bothWished: true, name: '카페');
      expect(v.kind, MarkerKind.visited);
      expect(v.glyph, '★');
      expect(v.badge, '✓');
    });

    test('세 상태의 글리프가 서로 다르다 — 색을 빼도 구분된다', () {
      final glyphs = {
        markerVisual(visited: false, bothWished: false, name: 'x').glyph,
        markerVisual(visited: false, bothWished: true, name: 'x').glyph,
        markerVisual(visited: true, bothWished: false, name: 'x').glyph,
      };
      expect(glyphs.length, 3);
    });

    test('라벨에 장소명과 상태가 모두 들어간다(스크린리더)', () {
      final v = markerVisual(visited: false, bothWished: true, name: '망원한강공원');
      expect(v.label, '망원한강공원 — 둘 다 찜');
    });
  });
}
