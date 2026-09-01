/// 일정 탭 — 월 그리드 + 그 날 아젠다.
///
/// ## 웹판과 같은 것
///
/// 뷰는 month/week/day 셋이고 **아젠다는 독립 뷰가 아니라 하단 절반**이다. 트랙은 필터가 아니라
/// **단일 선택 전환**이라 한 번에 한 트랙만 그린다(그래서 월 그리드에 세 색이 섞이지 않는다).
///
/// ## 이 화면이 지금 하는 것 (P1)
///
/// 월 그리드 · 날짜 선택 · 그 날 아젠다 · 트랙 전환. 일정 생성/수정과 반복 편집은 P2다.
/// 반복 일정은 **읽기**만 한다 — 전개해서 보여주되 고치지는 않는다.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/auth.dart';
import '../state/event_actions.dart';
import '../state/events.dart';
import 'event_sheet.dart';
import 'event_row.dart';
import 'month_grid.dart';
import 'track.dart';
import 'tz.dart';

class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key});

  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  /// 보고 있는 달의 아무 날(1일로 정규화해 쓴다).
  late DateTime _month = _firstOfMonth(toDisplay(DateTime.now().toUtc()));

  /// 선택한 날짜 키. null이면 오늘.
  String? _selected;

  /// 단일 선택 트랙. null = 전부.
  Track? _track;

  static DateTime _firstOfMonth(DateTime d) => DateTime.utc(d.year, d.month, 1);

  /// 시트를 열고 결과를 쓰기 계층으로 넘긴다. 결과 메시지는 한 곳에서 낸다 —
  /// 무음 실패가 생기지 않게 모든 경로가 무언가를 말하거나 화면을 바꾼다(§4.3).
  Future<void> _openSheet(String dayKeyStr, EventRow? existing) async {
    final myId = ref.read(currentUserProvider)?.id;
    final result = await showEventSheet(
      context,
      dayKeyStr: dayKeyStr,
      myId: myId,
      existing: existing,
    );
    if (result == null || !mounted) return;

    final actions = ref.read(eventActionsProvider);
    final outcome = switch (result) {
      EventSheetSave(:final event) => await actions.create(event),
      EventSheetPatch(:final patch) => await actions.update(existing!, patch),
      EventSheetDelete() => await actions.delete(existing!),
    };
    if (!mounted) return;
    final msg = outcomeMessage(outcome);
    if (msg != null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(msg)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final myId = ref.watch(currentUserProvider)?.id;
    final events = ref.watch(eventsProvider);
    final selectedKey = _selected ?? dayKey(DateTime.now().toUtc());

    return Scaffold(
      appBar: AppBar(
        title: Text('${_month.year}년 ${_month.month}월'),
        actions: [
          IconButton(
            tooltip: '이전 달',
            icon: const Icon(Icons.chevron_left),
            onPressed: () => setState(() =>
                _month = DateTime.utc(_month.year, _month.month - 1, 1)),
          ),
          IconButton(
            tooltip: '다음 달',
            icon: const Icon(Icons.chevron_right),
            onPressed: () => setState(() =>
                _month = DateTime.utc(_month.year, _month.month + 1, 1)),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _openSheet(selectedKey, null),
        tooltip: '일정 만들기',
        child: const Icon(Icons.add),
      ),
      body: events.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorState(message: '$e', onRetry: () => ref.invalidate(eventsProvider)),
        data: (rows) {
          final visible = _track == null
              ? rows
              : rows
                  .where((e) =>
                      deriveTrack(
                          visibility: e.visibility,
                          ownerId: e.ownerId,
                          myId: myId) ==
                      _track)
                  .toList(growable: false);
          return Column(
            children: [
              _TrackChips(
                selected: _track,
                onSelect: (t) => setState(() => _track = t),
              ),
              MonthGrid(
                month: _month,
                events: visible,
                myId: myId,
                selectedKey: selectedKey,
                onSelectDay: (k) => setState(() => _selected = k),
              ),
              const Divider(height: 1),
              Expanded(
                child: _DayAgenda(
                  dayKeyStr: selectedKey,
                  events: visible,
                  myId: myId,
                  onTapEvent: (e) => _openSheet(selectedKey, e),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// 트랙 전환 — 필터가 아니라 '어느 캘린더를 보는가'다(웹판과 같은 의미).
///
/// 색만으로 말하지 않는다: 라벨 텍스트 + 선택 상태(aria에 해당하는 `selected`)로 이중화(§8).
class _TrackChips extends StatelessWidget {
  const _TrackChips({required this.selected, required this.onSelect});
  final Track? selected;
  final ValueChanged<Track?> onSelect;

  @override
  Widget build(BuildContext context) {
    final items = <(Track?, String)>[
      (null, '전체'),
      (Track.shared, '함께'),
      (Track.mine, '나'),
      (Track.partner, '상대'),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          for (final (t, label) in items)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(label),
                selected: selected == t,
                onSelected: (_) => onSelect(t),
              ),
            ),
        ],
      ),
    );
  }
}

/// 고른 날의 일정 목록.
class _DayAgenda extends StatelessWidget {
  const _DayAgenda({
    required this.dayKeyStr,
    required this.events,
    required this.myId,
    required this.onTapEvent,
  });

  final String dayKeyStr;
  final List<EventRow> events;
  final String? myId;
  final ValueChanged<EventRow> onTapEvent;

  @override
  Widget build(BuildContext context) {
    // 그 날 회차 — 반복 전개를 거친 결과에서 고른다(월 그리드와 같은 도출).
    final parts = dayKeyStr.split('-');
    final byDay = occurrencesByDay(
        events, int.parse(parts[0]), int.parse(parts[1]) - 1);
    final items = byDay[dayKeyStr] ?? const <EventRow>[];
    if (items.isEmpty) {
      // 빈 상태는 죽은 화면이 아니어야 한다(ux §7).
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('이 날은 비어 있어요', textAlign: TextAlign.center),
        ),
      );
    }
    return ListView.separated(
      itemCount: items.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (context, i) {
        final e = items[i];
        final t = deriveTrack(
            visibility: e.visibility, ownerId: e.ownerId, myId: myId);
        return ListTile(
          // 색 + 라벨 이중화 — 점만 있으면 색각 이상에서 구분되지 않는다(§8).
          leading: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.circle,
                  size: 12,
                  color: trackColor(t, Theme.of(context).brightness)),
              const SizedBox(height: 2),
              // 색만으로 말하지 않는다 — 라벨이 이중화의 본체다(§8).
              Text(t.label, style: Theme.of(context).textTheme.labelSmall),
            ],
          ),
          title: Text(e.title),
          subtitle: Text(e.isAllDay
              ? '종일'
              : '${formatTime(e.startAt)} – ${formatTime(e.endAt)}'),
          // 반복 회차는 시리즈 원본이 아니라 그 회차 시각을 들고 있다 — 시트는 잠긴다.
          trailing: e.recurrenceRule != null
              ? const Icon(Icons.repeat, size: 16)
              : null,
          onTap: () => onTapEvent(e),
        );
      },
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('일정을 불러오지 못했어요'),
              const SizedBox(height: 8),
              Text(message, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 16),
              // 인라인 에러 + 재시도(ux §7) — 죽은 화면으로 두지 않는다.
              FilledButton(onPressed: onRetry, child: const Text('다시 시도')),
            ],
          ),
        ),
      );
}
