/// 여행 탭 — 목록과 Day 계획.
///
/// ## 계획을 저장하지 않는다
///
/// Day N의 스톱은 그 날짜에 든 `events` 중 `place_id`가 있는 것이다([stopsOfDay]).
/// 그래서 이 화면은 **읽기 도출만** 한다 — 스톱을 더하고 빼는 건 캘린더에 일정을 넣고 빼는
/// 일과 같고, 그건 일정 탭이 이미 한다.
///
/// 여행 탭에서 스톱을 직접 추가하는 UI는 다음 조각이다. 지금 붙이면 '여행 전용 저장소'가
/// 필요해 보이는 착시가 생기는데, 그게 이 설계가 피하려던 바로 그 함정이다.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../calendar/event_row.dart';
import '../calendar/tz.dart';
import '../places/place_row.dart';
import '../state/events.dart';
import '../state/places.dart';
import '../state/trips.dart';
import 'trip_days.dart';
import 'trip_row.dart';

class TripsScreen extends ConsumerWidget {
  const TripsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trips = ref.watch(tripsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('여행')),
      body: trips.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _Error(
          message: '$e',
          onRetry: () => ref.invalidate(tripsProvider),
        ),
        data: (rows) {
          if (rows.isEmpty) return const _Empty();
          final today = dayKey(DateTime.now().toUtc());
          final sorted = sortTripsForList(rows, today);
          return ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: sorted.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (_, i) => _TripTile(trip: sorted[i], todayKey: today),
          );
        },
      ),
    );
  }
}

class _TripTile extends StatelessWidget {
  const _TripTile({required this.trip, required this.todayKey});
  final TripRow trip;
  final String todayKey;

  @override
  Widget build(BuildContext context) {
    final phase = tripPhase(trip, todayKey);
    return ListTile(
      title: Text(trip.title),
      subtitle: Text('${trip.startDate} ~ ${trip.endDate}'),
      // 국면은 색이 아니라 **글자**로 말한다(§8). '여행 중'/'D-3'/'3일 전'.
      trailing: Chip(
        label: Text(tripPhaseLabel(trip, todayKey)),
        visualDensity: VisualDensity.compact,
        backgroundColor: phase == TripPhase.ongoing
            ? Theme.of(context).colorScheme.primaryContainer
            : null,
      ),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => TripDetailScreen(trip: trip)),
      ),
    );
  }
}

/// 여행 상세 — Day별 스톱.
class TripDetailScreen extends ConsumerWidget {
  const TripDetailScreen({super.key, required this.trip});
  final TripRow trip;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final events = ref.watch(eventsProvider).value ?? const <EventRow>[];
    final places = ref.watch(placesProvider).value ?? const <PlaceRow>[];
    final byId = {for (final p in places) p.id: p};
    final days = tripDays(trip);

    return Scaffold(
      appBar: AppBar(
        title: Text(trip.title),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(20),
          child: Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text('${trip.startDate} ~ ${trip.endDate}',
                style: Theme.of(context).textTheme.bodySmall),
          ),
        ),
      ),
      body: days.isEmpty
          // tripDays가 빈 배열을 주는 건 end < start인 잘못된 행뿐이다 — 죽은 화면 대신 말한다.
          ? const Center(child: Text('여행 기간이 올바르지 않아요.'))
          : ListView.builder(
              padding: const EdgeInsets.only(bottom: 24),
              itemCount: days.length,
              itemBuilder: (_, i) => _DaySection(
                day: days[i],
                stops: stopsOfDay(events, days[i].key),
                notes: notesOfDay(events, days[i].key),
                placeById: byId,
              ),
            ),
    );
  }
}

class _DaySection extends StatelessWidget {
  const _DaySection({
    required this.day,
    required this.stops,
    required this.notes,
    required this.placeById,
  });

  final TripDay day;
  final List<EventRow> stops;
  final List<EventRow> notes;
  final Map<String, PlaceRow> placeById;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
          child: Row(
            children: [
              Text('Day ${day.index}',
                  style: theme.textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(width: 8),
              Text(day.key, style: theme.textTheme.bodySmall),
            ],
          ),
        ),
        if (stops.isEmpty && notes.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            // 빈 Day도 죽은 칸이 아니어야 한다 — 어디서 채우는지 알려준다.
            child: Text('아직 비어 있어요. 일정 탭에서 장소를 연결한 일정을 만들면 여기 스톱으로 떠요.',
                style: theme.textTheme.bodySmall),
          ),
        // 번호 배지 — 순서 있는 하루로 읽히게 한다(웹판 트리플 개선의 핵심).
        for (var i = 0; i < stops.length; i++)
          _StopTile(
            index: i + 1,
            event: stops[i],
            place: placeById[stops[i].placeId],
          ),
        // 장소 없는 일정은 스톱과 나눠 둔다 — 섞으면 "여기도 가는 곳인가?"로 읽힌다.
        for (final n in notes)
          ListTile(
            dense: true,
            leading: const Icon(Icons.sticky_note_2_outlined, size: 18),
            title: Text(n.title, style: theme.textTheme.bodyMedium),
            subtitle: n.isAllDay ? null : Text(formatTime(n.startAt)),
          ),
      ],
    );
  }
}

class _StopTile extends StatelessWidget {
  const _StopTile({required this.index, required this.event, this.place});
  final int index;
  final EventRow event;
  final PlaceRow? place;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final meta = [place?.category, place?.regionLabel]
        .where((s) => s != null && s.isNotEmpty)
        .join(' · ');
    return ListTile(
      leading: CircleAvatar(
        radius: 14,
        backgroundColor: theme.colorScheme.primaryContainer,
        child: Text('$index',
            style: theme.textTheme.labelMedium
                ?.copyWith(color: theme.colorScheme.onPrimaryContainer)),
      ),
      title: Text(place?.name ?? event.title),
      subtitle: Text([
        if (!event.isAllDay) formatTime(event.startAt),
        if (meta.isNotEmpty) meta,
      ].join(' · ')),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) => const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.luggage_outlined, size: 40),
              SizedBox(height: 12),
              Text('아직 만든 여행이 없어요', textAlign: TextAlign.center),
              SizedBox(height: 6),
              Text('날짜를 정하면 그날그날 어디를 갈지 담아둘 수 있어요.',
                  textAlign: TextAlign.center),
            ],
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
              const Text('여행을 불러오지 못했어요'),
              const SizedBox(height: 8),
              Text(message, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 16),
              FilledButton(onPressed: onRetry, child: const Text('다시 시도')),
            ],
          ),
        ),
      );
}
