/// 지도 화면 — MapView + 장소 시트 조립.
///
/// 시트 스냅 물리는 Flutter 표준 [DraggableScrollableSheet]에 맡긴다(네이티브
/// 감각의 드래그/플릭이 공짜). 정지점 값의 단일 출처는 `sheet_snap.dart`의
/// [snapRatios] — 웹판과 같은 peek/half/full 비율을 쓴다.
///
/// **C1 연결**: 시트 스냅이 바뀔 때마다 [sheetOcclusionPx]를 다시 계산해
/// [MapView.bottomOcclusionPx]로 내린다 → SDK `contentPadding` → 핀이 시트 뒤로
/// 숨지 않는다. 웹판 `MapPage`가 snap을 끌어올려 두 컴포넌트에 나눠주던 구조의
/// 정돈된 대체.
library;

import 'package:flutter/material.dart';

import 'map_focus.dart';
import 'map_view.dart';
import 'sheet_snap.dart';

/// peek 정지 시 노출 콘텐츠 높이(핸들+요약) — 웹판 peekPx에 해당.
const double _peekPx = 144;

class MapScreen extends StatefulWidget {
  const MapScreen({
    super.key,
    required this.places,
    this.polyline,
  });

  final List<MapPlace> places;
  final List<({double lat, double lng})>? polyline;

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  String? _selectedId;
  SnapStop _snap = SnapStop.peek;
  final _sheetController = DraggableScrollableController();

  void _select(String id) {
    setState(() {
      _selectedId = id;
      // 선택 → peek에서 half로 승격(웹판 PlaceSheet의 자동 승격과 동일).
      if (_snap == SnapStop.peek) _snap = SnapStop.half;
    });
    _animateTo(_snap);
  }

  void _close() {
    // 닫으면 snap을 peek로 되돌린다 — 다음에 아래에서 올라오는 느낌 유지(웹판 동일).
    setState(() {
      _selectedId = null;
      _snap = SnapStop.peek;
    });
  }

  void _animateTo(SnapStop stop) {
    if (!_sheetController.isAttached) return;
    _sheetController.animateTo(
      _ratioFor(stop),
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutCubic,
    );
  }

  double _ratioFor(SnapStop stop) {
    if (stop == SnapStop.peek) {
      final h = MediaQuery.sizeOf(context).height;
      return h > 0 ? (_peekPx / h).clamp(0.05, 0.5) : snapRatios[stop]!;
    }
    return snapRatios[stop]!;
  }

  MapPlace? get _selected {
    final id = _selectedId;
    if (id == null) return null;
    for (final p in widget.places) {
      if (p.id == id) return p;
    }
    return null;
  }

  @override
  void dispose() {
    _sheetController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.sizeOf(context).height;
    final selected = _selected;
    final sheetOpen = selected != null;
    final occlusion = sheetOcclusionPx(
      sheetOpen: sheetOpen,
      snap: _snap,
      viewportHeight: h,
      peekPx: _peekPx,
    );

    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: MapView(
              places: widget.places,
              selectedId: _selectedId,
              onSelect: _select,
              onMapTap: _close,
              bottomOcclusionPx: occlusion,
              polyline: widget.polyline,
            ),
          ),
          if (sheetOpen)
            NotificationListener<DraggableScrollableNotification>(
              onNotification: (n) {
                // 드래그 정지점 추적 — extent에서 가장 가까운 스냅을 도출해
                // occlusion(→ contentPadding)을 따라가게 한다.
                final travel = h;
                final settled = snapForOffset(
                  travel * (1 - n.extent),
                  travel,
                  _peekPx,
                );
                if (settled != _snap) setState(() => _snap = settled);
                return false;
              },
              child: DraggableScrollableSheet(
                controller: _sheetController,
                initialChildSize: _ratioFor(_snap),
                minChildSize: _ratioFor(SnapStop.peek),
                maxChildSize: snapRatios[SnapStop.full]!,
                snap: true,
                snapSizes: [
                  _ratioFor(SnapStop.peek),
                  snapRatios[SnapStop.half]!,
                  snapRatios[SnapStop.full]!,
                ],
                builder: (context, scrollController) => _PlaceSheet(
                  place: selected,
                  scrollController: scrollController,
                  onClose: _close,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// 장소 시트(슬라이스 최소판) — 핸들 + 이름/상태 + 닫기.
/// 저장·메모·리액션 등 전체 기능은 데이터 계층(위시 mutation)과 함께 붙인다.
class _PlaceSheet extends StatelessWidget {
  const _PlaceSheet({
    required this.place,
    required this.scrollController,
    required this.onClose,
  });

  final MapPlace place;
  final ScrollController scrollController;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surface,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      elevation: 8,
      child: ListView(
        controller: scrollController,
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        children: [
          Center(
            child: Container(
              width: 36,
              height: 4,
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: scheme.outlineVariant,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Row(
            children: [
              Expanded(
                child: Text(
                  place.name,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              IconButton(
                onPressed: onClose,
                icon: const Icon(Icons.close),
                tooltip: '닫기',
              ),
            ],
          ),
          const SizedBox(height: 4),
          // 상태는 색이 아니라 텍스트로도(§8 이중화).
          Text(
            place.visited
                ? '★ 가봤음'
                : place.bothWished
                    ? '✦ 둘 다 찜'
                    : '☆ 가고싶음',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }
}
