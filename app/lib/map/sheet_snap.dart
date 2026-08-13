/// 드래그 시트 스냅 전이 — 순수 로직. SDK·위젯 비의존.
///
/// 웹판 `src/lib/places/sheetSnap.ts`의 충실한 이식.
/// ratio = 시트가 차지하는 viewport 비율(높을수록 더 펼침).
library;

enum SnapStop { peek, half, full }

/// peek: 핸들+요약만 / half: 절반 / full: 거의 전체(상단 safe-area 여백 남김).
const Map<SnapStop, double> snapRatios = {
  SnapStop.peek: 0.18,
  SnapStop.half: 0.5,
  SnapStop.full: 0.92,
};

const List<SnapStop> _order = [SnapStop.peek, SnapStop.half, SnapStop.full];

/// 한 단계 펼침(탭 대체 버튼·아래→위 드래그). full에서 클램프.
SnapStop nextSnap(SnapStop cur) {
  final i = _order.indexOf(cur);
  return _order[(i + 1).clamp(0, _order.length - 1)];
}

/// 한 단계 접음(위→아래 드래그). peek에서 클램프.
SnapStop prevSnap(SnapStop cur) {
  final i = _order.indexOf(cur);
  return _order[(i - 1).clamp(0, _order.length - 1)];
}

/// ratio → 시트 상단 translateY(px). 탭바 제외 travel 높이 기준.
double translateYFor(SnapStop stop, double travelHeight, double peekPx) {
  if (stop == SnapStop.peek) {
    final v = travelHeight - peekPx;
    return v < 0 ? 0 : v;
  }
  return travelHeight * (1 - snapRatios[stop]!);
}

/// 드래그 종료 시 현재 translateY에 가장 가까운 스냅으로 흡착.
SnapStop snapForOffset(double translateY, double travelHeight, double peekPx) {
  var best = SnapStop.peek;
  var bestDist = double.infinity;
  for (final s in _order) {
    final y = translateYFor(s, travelHeight, peekPx);
    final d = (translateY - y).abs();
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

/// 시트 translateY → 백드롭 딤 진행(0..1). peek 정지=0, full 정지=1.
double dimProgress(double translateY, double peekRestY, double fullRestY) {
  if (peekRestY == fullRestY) return 0;
  final t = (peekRestY - translateY) / (peekRestY - fullRestY);
  return t.clamp(0.0, 1.0);
}

/// 플릭 속도(px/ms; 아래로 +, 위로 -)를 반영한 스냅. |v|<임계는 위치 기반과 동일.
SnapStop snapForFlick(
  double translateY,
  double velocity,
  double travelHeight,
  double peekPx, {
  double threshold = 0.5,
}) {
  final nearest = snapForOffset(translateY, travelHeight, peekPx);
  if (velocity.abs() < threshold) return nearest;
  // 아래로 빠르게 = 접기(prev), 위로 빠르게 = 펼치기(next).
  return velocity > 0 ? prevSnap(nearest) : nextSnap(nearest);
}
