/// 장소 탭 — 담은 곳을 지역별로 모아 보고, 찾고, 관리한다.
///
/// ## 지도와 역할을 가른다
///
/// 지도는 **공간**을 보는 곳이고 여기는 **목록**을 다루는 곳이다. 웹판은 이 둘을 지도 위
/// 드래그 시트 하나에 몰아넣었다가, 상태가 꼬여 지도가 잠기는 버그를 겪고 갈랐다.
/// Flutter판은 처음부터 갈라져 있다 — 지도 시트는 '고른 장소의 상세'만 띄운다.
///
/// ## 검색이 이 탭의 존재 이유다
///
/// 지도 상단 검색창은 외부 API로 *새* 장소를 찾는 입구다. 담은 곳을 다시 꺼내는 수단은
/// 앱 어디에도 없었고, 장소가 쌓이면 그게 가장 먼저 무너진다.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/couple.dart';
import '../state/places.dart';
import 'place_row.dart';
import 'region_clusters.dart';
import 'search_saved.dart';

class PlacesScreen extends ConsumerStatefulWidget {
  const PlacesScreen({super.key});

  @override
  ConsumerState<PlacesScreen> createState() => _PlacesScreenState();
}

class _PlacesScreenState extends ConsumerState<PlacesScreen> {
  final _query = TextEditingController();
  StatusFilter _status = StatusFilter.all;

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final places = ref.watch(placesProvider);
    final visited = ref.watch(visitedIdsProvider).value ?? const <String>{};
    final couple = ref.watch(coupleProvider).value;

    return Scaffold(
      appBar: AppBar(title: const Text('장소')),
      body: places.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _Error(
          message: '$e',
          onRetry: () => ref.invalidate(placesProvider),
        ),
        data: (rows) {
          if (rows.isEmpty) return const _EmptyAll();
          final filtered = filterSaved(
            rows,
            status: _status,
            query: _query.text,
            visitedIds: visited,
          );
          final clusters = regionClusters(filtered);

          return Column(
            children: [
              _SearchRow(
                controller: _query,
                onChanged: (_) => setState(() {}),
              ),
              _FilterRow(
                status: _status,
                count: filtered.length,
                onSelect: (s) => setState(() => _status = s),
              ),
              const Divider(height: 1),
              Expanded(
                child: clusters.isEmpty
                    // 담은 건 있는데 조건에 맞는 게 없다 — '장소 없음'과 구분되는 부분 빈 상태.
                    ? const _EmptyFiltered()
                    : ListView.builder(
                        padding: const EdgeInsets.only(bottom: 24),
                        itemCount: clusters.length,
                        itemBuilder: (_, i) => _RegionSection(
                          cluster: clusters[i],
                          visitedIds: visited,
                          soloCouple: couple?.isSolo ?? true,
                        ),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _SearchRow extends StatelessWidget {
  const _SearchRow({required this.controller, required this.onChanged});
  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
        child: TextField(
          controller: controller,
          onChanged: onChanged,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: '이름 · 지역 · 카테고리로 찾기',
            prefixIcon: const Icon(Icons.search),
            border: const OutlineInputBorder(),
            isDense: true,
            suffixIcon: controller.text.isEmpty
                ? null
                : IconButton(
                    tooltip: '지우기',
                    icon: const Icon(Icons.close),
                    onPressed: () {
                      controller.clear();
                      onChanged('');
                    },
                  ),
          ),
        ),
      );
}

class _FilterRow extends StatelessWidget {
  const _FilterRow({
    required this.status,
    required this.count,
    required this.onSelect,
  });

  final StatusFilter status;
  final int count;
  final ValueChanged<StatusFilter> onSelect;

  static const _labels = {
    StatusFilter.all: '전체',
    StatusFilter.wish: '가고싶음',
    StatusFilter.visited: '가봤음',
  };

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        child: Row(
          children: [
            for (final e in _labels.entries)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(e.value),
                  selected: status == e.key,
                  onSelected: (_) => onSelect(e.key),
                ),
              ),
            const Spacer(),
            Text('$count곳', style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      );
}

class _RegionSection extends StatelessWidget {
  const _RegionSection({
    required this.cluster,
    required this.visitedIds,
    required this.soloCouple,
  });

  final RegionCluster cluster;
  final Set<String> visitedIds;
  final bool soloCouple;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
          child: Row(
            children: [
              Text('${cluster.label} ',
                  style: theme.textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.bold)),
              Text('${cluster.count}곳', style: theme.textTheme.bodySmall),
              const Spacer(),
              // 임계치 미달이면 몇 곳이 더 필요한지 **글자로** 말한다 —
              // 버튼 유무만으로 상태를 표현하면 왜 없는지 알 수 없다(§8).
              if (!cluster.ready)
                Text('${recoThreshold - cluster.count}곳 더 모으면 코스를 짜드려요',
                    style: theme.textTheme.bodySmall),
            ],
          ),
        ),
        for (final p in cluster.places)
          _PlaceTile(
            place: p,
            visited: visitedIds.contains(p.id),
            soloCouple: soloCouple,
          ),
      ],
    );
  }
}

class _PlaceTile extends StatelessWidget {
  const _PlaceTile({
    required this.place,
    required this.visited,
    required this.soloCouple,
  });

  final PlaceRow place;
  final bool visited;
  final bool soloCouple;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final meta = [place.category, place.regionLabel]
        .where((s) => s != null && s.isNotEmpty)
        .join(' · ');
    return ListTile(
      // 별 모양으로 상태를 말한다 — 색만으로는 색각 이상에서 구분되지 않는다(§8).
      leading: Icon(
        visited ? Icons.star : Icons.star_border,
        color: visited ? theme.colorScheme.primary : null,
      ),
      title: Text(place.name),
      subtitle: meta.isEmpty ? null : Text(meta),
      trailing: visited
          ? Text('가봤음', style: theme.textTheme.labelSmall)
          : null,
    );
  }
}

class _EmptyAll extends StatelessWidget {
  const _EmptyAll();

  @override
  Widget build(BuildContext context) => const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.bookmark_border, size: 40),
              SizedBox(height: 12),
              Text('아직 담은 장소가 없어요', textAlign: TextAlign.center),
              SizedBox(height: 6),
              Text(
                '지도에서 가고싶은 곳을 담으면 여기 지역별로 모여요.',
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
}

class _EmptyFiltered extends StatelessWidget {
  const _EmptyFiltered();

  @override
  Widget build(BuildContext context) => const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Text(
            '조건에 맞는 장소가 없어요.\n검색어를 지우거나 다른 필터를 눌러보세요.',
            textAlign: TextAlign.center,
          ),
        ),
      );
}

class _Error extends StatelessWidget {
  const _Error({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('장소를 불러오지 못했어요'),
              const SizedBox(height: 8),
              Text(message, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 16),
              FilledButton(onPressed: onRetry, child: const Text('다시 시도')),
            ],
          ),
        ),
      );
}
