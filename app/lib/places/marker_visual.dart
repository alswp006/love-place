/// 지도 마커 모양 도출(§5.5 · ux §4) — **색만이 아니라 모양으로** 상태 구분(색각 이상 대응).
///
/// 가고싶음=빈 별(☆) / 둘 다 찜=4점 별(✦) / 가봤음=채운 별(★). 우선순위: 가봤음 > 둘 다 찜 > 가고싶음.
/// 하트(♥)는 좋아요 리액션 전용이라 마커 글리프로 쓰지 않는다.
///
/// 웹판 `src/lib/places/markerVisual.ts`의 충실한 이식.
library;

enum MarkerKind { wish, both, visited }

class MarkerVisual {
  const MarkerVisual({
    required this.glyph,
    required this.kind,
    required this.label,
    this.badge,
  });

  final String glyph;
  final MarkerKind kind;

  /// 접근성 라벨 — 스크린리더가 읽는 문장(ux §4). 색·모양에 더한 3중화.
  final String label;

  /// 보조 배지(가봤음의 체크). 없으면 null.
  final String? badge;
}

MarkerVisual markerVisual({
  required bool visited,
  required bool bothWished,
  required String name,
}) {
  if (visited) {
    return MarkerVisual(
      glyph: '★',
      kind: MarkerKind.visited,
      label: '$name — 가봤음',
      badge: '✓',
    );
  }
  if (bothWished) {
    return MarkerVisual(
      glyph: '✦',
      kind: MarkerKind.both,
      label: '$name — 둘 다 찜',
    );
  }
  return MarkerVisual(
    glyph: '☆',
    kind: MarkerKind.wish,
    label: '$name — 가고싶음',
  );
}
