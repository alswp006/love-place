/// 지도 화면 — MapView + 검색 오버레이 + 장소/저장 시트 조립.
///
/// 시트 스냅 물리는 Flutter 표준 [DraggableScrollableSheet]에 맡긴다(네이티브
/// 감각의 드래그/플릭이 공짜). 정지점 값의 단일 출처는 `sheet_snap.dart`의
/// [snapRatios] — 웹판과 같은 peek/half/full 비율을 쓴다.
///
/// **C1 연결**: 시트 스냅이 바뀔 때마다 [sheetOcclusionPx]를 다시 계산해
/// [MapView.bottomOcclusionPx]로 내린다 → SDK `contentPadding` → 핀이 시트 뒤로
/// 숨지 않는다.
///
/// **위시 저장 ≤3탭(ux §3, 원칙)**: 검색 입력(1) → 후보 탭(2) → 저장(3).
/// 회귀 테스트(`map_screen_save_flow_test.dart`)가 이 탭 수를 고정한다.
library;

import 'package:flutter/material.dart';

import '../places/save_place.dart' show SaveResult;
import '../search/place_hit.dart';
import '../search/search_controller.dart';
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
    this.onSaveHit,
    this.searchController,
  });

  final List<MapPlace> places;
  final List<({double lat, double lng})>? polyline;

  /// 검색 후보 저장(MapTab이 제공 — savePlace + provider 무효화).
  /// null이면 저장 버튼 비활성(미설정/미로그인 빌드).
  final Future<SaveResult> Function(PlaceHit hit)? onSaveHit;

  /// 테스트 주입용. 미지정 시 프록시 호출 컨트롤러 생성.
  final PlaceSearchController? searchController;

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  String? _selectedId;
  PlaceHit? _previewHit;
  SnapStop _snap = SnapStop.peek;
  bool _saving = false;
  String? _saveError;
  final _sheetController = DraggableScrollableController();
  final _searchFocus = FocusNode();
  late final PlaceSearchController _search =
      widget.searchController ?? PlaceSearchController();

  void _select(String id) {
    setState(() {
      _selectedId = id;
      _previewHit = null;
      // 선택 → peek에서 half로 승격(웹판 PlaceSheet의 자동 승격과 동일).
      if (_snap == SnapStop.peek) _snap = SnapStop.half;
    });
    _animateTo(_snap);
  }

  void _preview(PlaceHit hit) {
    _searchFocus.unfocus();
    setState(() {
      _previewHit = hit;
      _selectedId = null;
      _saveError = null;
      if (_snap == SnapStop.peek) _snap = SnapStop.half;
    });
    _animateTo(_snap);
  }

  void _close() {
    // 닫으면 snap을 peek로 되돌린다 — 다음에 아래에서 올라오는 느낌 유지(웹판 동일).
    setState(() {
      _selectedId = null;
      _previewHit = null;
      _saveError = null;
      _snap = SnapStop.peek;
    });
  }

  Future<void> _save() async {
    final hit = _previewHit;
    final onSave = widget.onSaveHit;
    if (hit == null || onSave == null || _saving) return;
    setState(() {
      _saving = true;
      _saveError = null;
    });
    try {
      final result = await onSave(hit);
      if (!mounted) return;
      _search.clear();
      // 저장 완료 → 프리뷰를 실카드 선택으로 전환(jumped=기존 카드로 점프).
      setState(() {
        _previewHit = null;
        _selectedId = result.placeId;
        _saving = false;
      });
    } catch (e) {
      if (!mounted) return;
      // 인라인 에러 + 입력값 보존(ux §7) — 시트를 닫지 않는다.
      setState(() {
        _saving = false;
        _saveError = '저장에 실패했어요. 다시 시도해주세요.';
      });
    }
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
    _searchFocus.dispose();
    if (widget.searchController == null) _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.sizeOf(context).height;
    final selected = _selected;
    final preview = _previewHit;
    final sheetOpen = selected != null || preview != null;
    final occlusion = sheetOcclusionPx(
      sheetOpen: sheetOpen,
      snap: _snap,
      viewportHeight: h,
      peekPx: _peekPx,
    );

    return Scaffold(
      resizeToAvoidBottomInset: false, // 키보드가 지도를 리사이즈하지 않게
      body: Stack(
        children: [
          Positioned.fill(
            child: MapView(
              places: widget.places,
              selectedId: _selectedId,
              onSelect: _select,
              onMapTap: () {
                _searchFocus.unfocus();
                _close();
              },
              bottomOcclusionPx: occlusion,
              polyline: widget.polyline,
              preview: preview == null
                  ? null
                  : (lat: preview.lat, lng: preview.lng, name: preview.name),
            ),
          ),
          _SearchOverlay(
            controller: _search,
            focusNode: _searchFocus,
            onPick: _preview,
          ),
          if (sheetOpen)
            NotificationListener<DraggableScrollableNotification>(
              onNotification: (n) {
                // 드래그 정지점 추적 — extent에서 가장 가까운 스냅을 도출해
                // occlusion(→ contentPadding)을 따라가게 한다.
                final settled = snapForOffset(h * (1 - n.extent), h, _peekPx);
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
                  preview: preview,
                  saving: _saving,
                  saveError: _saveError,
                  canSave: widget.onSaveHit != null,
                  scrollController: scrollController,
                  onSave: _save,
                  onClose: _close,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// 검색 오버레이 — 상단 입력 + 후보 리스트(로딩/빈/에러 상태 포함, ux §7).
class _SearchOverlay extends StatelessWidget {
  const _SearchOverlay({
    required this.controller,
    required this.focusNode,
    required this.onPick,
  });

  final PlaceSearchController controller;
  final FocusNode focusNode;
  final ValueChanged<PlaceHit> onPick;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
        child: ListenableBuilder(
          listenable: controller,
          builder: (context, _) {
            final showResults = controller.query.trim().isNotEmpty &&
                controller.status != SearchStatus.idle;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Material(
                  elevation: 2,
                  borderRadius: BorderRadius.circular(12),
                  color: scheme.surface,
                  child: TextField(
                    focusNode: focusNode,
                    onChanged: controller.setQuery,
                    controller: _textOf(controller),
                    decoration: InputDecoration(
                      hintText: '가고 싶은 곳 검색',
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: controller.query.isEmpty
                          ? null
                          : IconButton(
                              icon: const Icon(Icons.close),
                              tooltip: '검색어 지우기',
                              onPressed: () {
                                controller.clear();
                                _textOf(controller).clear();
                              },
                            ),
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 14),
                    ),
                  ),
                ),
                if (showResults)
                  Flexible(
                    child: Material(
                      elevation: 2,
                      borderRadius: BorderRadius.circular(12),
                      color: scheme.surface,
                      child: _results(context),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }

  // 컨트롤러당 TextEditingController 1개 — 화면 재빌드에도 입력값 보존.
  static final _texts = Expando<TextEditingController>();
  static TextEditingController _textOf(PlaceSearchController c) =>
      _texts[c] ??= TextEditingController();

  Widget _results(BuildContext context) {
    switch (controller.status) {
      case SearchStatus.loading:
        return const Padding(
          padding: EdgeInsets.all(16),
          child: Center(
              child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2))),
        );
      case SearchStatus.error:
        return Padding(
          padding: const EdgeInsets.all(16),
          child: Text(controller.error ?? '검색에 실패했어요.',
              textAlign: TextAlign.center),
        );
      case SearchStatus.done when controller.hits.isEmpty:
        return const Padding(
          padding: EdgeInsets.all(16),
          child: Text('검색 결과가 없어요. 다른 이름으로 찾아볼까요?',
              textAlign: TextAlign.center),
        );
      case SearchStatus.done:
        return ListView.builder(
          shrinkWrap: true,
          padding: const EdgeInsets.symmetric(vertical: 4),
          itemCount: controller.hits.length,
          itemBuilder: (context, i) {
            final hit = controller.hits[i];
            return ListTile(
              dense: true,
              leading: const Icon(Icons.place_outlined),
              title: Text(hit.name,
                  maxLines: 1, overflow: TextOverflow.ellipsis),
              subtitle: Text(hit.address,
                  maxLines: 1, overflow: TextOverflow.ellipsis),
              onTap: () => onPick(hit),
            );
          },
        );
      case SearchStatus.idle:
        return const SizedBox.shrink();
    }
  }
}

/// 장소/프리뷰 시트 — 저장(프리뷰) 또는 상태 표시(저장된 장소).
class _PlaceSheet extends StatelessWidget {
  const _PlaceSheet({
    required this.place,
    required this.preview,
    required this.saving,
    required this.saveError,
    required this.canSave,
    required this.scrollController,
    required this.onSave,
    required this.onClose,
  });

  final MapPlace? place;
  final PlaceHit? preview;
  final bool saving;
  final String? saveError;
  final bool canSave;
  final ScrollController scrollController;
  final VoidCallback onSave;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final title = preview?.name ?? place?.name ?? '';
    return Material(
      color: theme.colorScheme.surface,
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
                color: theme.colorScheme.outlineVariant,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Row(
            children: [
              Expanded(
                child: Text(title, style: theme.textTheme.titleLarge),
              ),
              IconButton(
                onPressed: onClose,
                icon: const Icon(Icons.close),
                tooltip: '닫기',
              ),
            ],
          ),
          const SizedBox(height: 4),
          if (preview != null) ...[
            Text(preview!.address, style: theme.textTheme.bodyMedium),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: (saving || !canSave) ? null : onSave,
              icon: saving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.star_border),
              label: Text(saving ? '저장 중…' : '가고싶은 곳으로 저장'),
            ),
            if (saveError != null) ...[
              const SizedBox(height: 8),
              Text(saveError!,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: theme.colorScheme.error)),
            ],
          ] else if (place != null)
            // 상태는 색이 아니라 텍스트로도(§8 이중화).
            Text(
              place!.visited
                  ? '★ 가봤음'
                  : place!.bothWished
                      ? '✦ 둘 다 찜'
                      : '☆ 가고싶음',
              style: theme.textTheme.bodyMedium,
            ),
        ],
      ),
    );
  }
}
