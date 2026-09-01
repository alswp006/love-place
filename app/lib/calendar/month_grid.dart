/// 월 그리드 — 6주 × 7일 셀에 그 날 일정 개수를 점으로 얹는다.
///
/// ## 왜 점만 찍나
///
/// 웹판은 셀 안에 제목 칩을 최대 2개 + `+N`으로 보여준다. 여기서는 점만 찍고 제목은 아래
/// 아젠다에 맡긴다 — 모바일 셀 폭(≈50px)에 한국어 제목을 넣으면 두세 글자에서 잘려
/// 아무것도 못 읽는다. 셀은 "이 날 뭔가 있다"만 말하고, 읽는 건 아젠다가 한다.
///
/// ## 색만으로 말하지 않는다
///
/// 점은 트랙 색을 쓰지만, 그것만으로는 색각 이상에서 구분되지 않는다(§8). 개수가 2개 이상이면
/// 숫자를 함께 적고, 선택된 날은 색이 아니라 **테두리**로도 갈린다.
library;

import 'package:flutter/material.dart';

import 'event_days.dart';
import 'event_row.dart';
import 'rrule.dart';
import 'track.dart';
import 'tz.dart';

/// 그 달의 회차를 날짜 키로 묶는다.
///
/// 반복 일정을 전개하는 곳이 여기다 — 규칙 행 하나가 그 달의 여러 회차를 만든다.
/// 윈도우는 **시각 범위**다: 끝을 그 날 00:00으로 주면 그 날 01:00 회차가 빠진다.
Map<String, List<EventRow>> occurrencesByDay(
  List<EventRow> events,
  int year,
  int month0,
) {
  final cells = monthMatrix(year, month0);
  if (cells.isEmpty) return const {};
  final winStart = startOfDay(cells.first.key);
  // 마지막 셀의 하루 끝까지 — 23:59:59.999.
  final winEnd = startOfDay(cells.last.key)
      .add(const Duration(days: 1))
      .subtract(const Duration(milliseconds: 1));

  final occ = expandEvents(events, winStart, winEnd);
  return groupByDay(occ, (o) => o.start).map(
    (k, v) => MapEntry(
      k,
      v.map((o) => o.event.occurrenceAt(o.start, o.end)).toList(growable: false),
    ),
  );
}

class MonthGrid extends StatelessWidget {
  const MonthGrid({
    super.key,
    required this.month,
    required this.events,
    required this.myId,
    required this.selectedKey,
    required this.onSelectDay,
  });

  /// 보고 있는 달(1일로 정규화된 값).
  final DateTime month;
  final List<EventRow> events;
  final String? myId;
  final String selectedKey;
  final ValueChanged<String> onSelectDay;

  static const _weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];

  @override
  Widget build(BuildContext context) {
    final cells = monthMatrix(month.year, month.month - 1); // month0는 0-based
    final byDay = occurrencesByDay(events, month.year, month.month - 1);
    final todayKey = dayKey(DateTime.now().toUtc());
    final brightness = Theme.of(context).brightness;

    return Column(
      children: [
        Row(
          children: [
            for (var i = 0; i < 7; i++)
              Expanded(
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Text(
                      _weekdayLabels[i],
                      style: Theme.of(context).textTheme.labelSmall,
                    ),
                  ),
                ),
              ),
          ],
        ),
        for (var row = 0; row * 7 < cells.length; row++)
          Row(
            children: [
              for (var col = 0; col < 7; col++)
                Expanded(
                  child: _DayCellView(
                    cell: cells[row * 7 + col],
                    items: byDay[cells[row * 7 + col].key] ?? const [],
                    myId: myId,
                    isToday: cells[row * 7 + col].key == todayKey,
                    isSelected: cells[row * 7 + col].key == selectedKey,
                    brightness: brightness,
                    onTap: onSelectDay,
                  ),
                ),
            ],
          ),
      ],
    );
  }
}

class _DayCellView extends StatelessWidget {
  const _DayCellView({
    required this.cell,
    required this.items,
    required this.myId,
    required this.isToday,
    required this.isSelected,
    required this.brightness,
    required this.onTap,
  });

  final DayCell cell;
  final List<EventRow> items;
  final String? myId;
  final bool isToday;
  final bool isSelected;
  final Brightness brightness;
  final ValueChanged<String> onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // 이번 달 밖 날짜는 흐리게 — 그래도 누를 수는 있다(웹판과 동일).
    final dim = !cell.inMonth;
    final dotTracks = <Track>{
      for (final e in items)
        deriveTrack(visibility: e.visibility, ownerId: e.ownerId, myId: myId),
    }.toList(growable: false);

    return Semantics(
      button: true,
      selected: isSelected,
      label: '${cell.key} · 일정 ${items.length}건',
      child: InkWell(
        onTap: () => onTap(cell.key),
        child: Container(
          // 터치 타깃 ≥44px(HIG). 고정 높이지만 셀 안 내용이 넘치지 않는 구조다.
          height: 52,
          margin: const EdgeInsets.all(2),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            // 선택은 색만이 아니라 테두리로도 말한다(§8).
            border: isSelected
                ? Border.all(color: theme.colorScheme.primary, width: 2)
                : null,
            color: isToday
                ? theme.colorScheme.primaryContainer.withValues(alpha: 0.4)
                : null,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                '${cell.day}',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: dim ? theme.disabledColor : null,
                  fontWeight: isToday ? FontWeight.bold : null,
                ),
              ),
              const SizedBox(height: 3),
              if (items.isEmpty)
                const SizedBox(height: 8)
              else
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (final t in dotTracks.take(3))
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 1),
                        child: Icon(Icons.circle,
                            size: 6, color: trackColor(t, brightness)),
                      ),
                    // 색·점 개수만으로는 규모가 안 읽힌다 — 2건 이상이면 숫자를 같이 적는다.
                    if (items.length > 1)
                      Padding(
                        padding: const EdgeInsets.only(left: 2),
                        child: Text('${items.length}',
                            style: theme.textTheme.labelSmall),
                      ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}
