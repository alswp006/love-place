import 'package:flutter_test/flutter_test.dart';

import 'package:weave/calendar/event_row.dart';
import 'package:weave/trips/trip_days.dart';
import 'package:weave/trips/trip_row.dart';

/// 여행 Day 도출 — **계획을 저장하지 않는다**는 계약의 검증.
///
/// Day N의 스톱 = 그 날짜 events 중 place_id가 있는 것. events.trip_id도 조인 테이블도 없다.
/// 이 규칙이 깨지면 캘린더와 여행이 이중 관리가 되고, "캘린더엔 있는데 여행엔 없다"가 생긴다.
TripRow _trip(String start, String end) => TripRow(
      id: 't1',
      title: '속초',
      startDate: start,
      endDate: end,
      version: 1,
    );

EventRow _ev(String id, DateTime start, {String? placeId}) => EventRow(
      id: id,
      title: id,
      startAt: start,
      endAt: start.add(const Duration(hours: 1)),
      isAllDay: false,
      timeZone: 'Asia/Seoul',
      visibility: 'SHARED',
      ownerId: 'u1',
      version: 1,
      placeId: placeId,
    );

void main() {
  group('tripDays', () {
    test('1박2일은 Day 슬롯 2개, index는 1부터', () {
      final d = tripDays(_trip('2026-09-01', '2026-09-02'));
      expect(d.map((x) => x.key), ['2026-09-01', '2026-09-02']);
      expect(d.map((x) => x.index), [1, 2]);
    });

    test('당일치기는 하루', () {
      expect(tripDays(_trip('2026-09-01', '2026-09-01')).length, 1);
    });

    test('월 경계를 넘어간다', () {
      final d = tripDays(_trip('2026-08-30', '2026-09-02'));
      expect(d.map((x) => x.key),
          ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']);
    });

    test('end < start(잘못된 행)면 빈 배열 — 무한 루프를 돌지 않는다', () {
      expect(tripDays(_trip('2026-09-05', '2026-09-01')), isEmpty);
    });

    test('★ 상한을 넘으면 잘라낸다 — DB CHECK만 믿고 폭주하지 않는다', () {
      expect(tripDays(_trip('2026-01-01', '2027-01-01'), maxDays: 60).length, 60);
    });
  });

  group('tripPhase / tripPhaseLabel', () {
    final t = _trip('2026-09-10', '2026-09-12');

    test('기간 안이면 진행중 — D-는 의미가 없다', () {
      expect(tripPhase(t, '2026-09-11'), TripPhase.ongoing);
      expect(tripPhaseLabel(t, '2026-09-11'), '여행 중');
    });

    test('시작일·종료일 당일도 진행중(경계 포함)', () {
      expect(tripPhase(t, '2026-09-10'), TripPhase.ongoing);
      expect(tripPhase(t, '2026-09-12'), TripPhase.ongoing);
    });

    test('예정은 D-N, 하루 전은 "내일 출발"', () {
      expect(tripPhaseLabel(t, '2026-09-07'), 'D-3');
      expect(tripPhaseLabel(t, '2026-09-09'), '내일 출발');
    });

    test('지난 여행은 N일 전, 하루 뒤는 "어제"', () {
      expect(tripPhaseLabel(t, '2026-09-13'), '어제');
      expect(tripPhaseLabel(t, '2026-09-15'), '3일 전');
    });
  });

  group('sortTripsForList', () {
    test('★ 진행중 → 예정(임박순) → 지난(최근순)', () {
      // 지금 무엇을 하고 있는지가 맨 위에 와야 한다.
      final trips = [
        _trip('2026-08-01', '2026-08-03'), // 지난(오래됨)
        _trip('2026-10-01', '2026-10-03'), // 예정(멂)
        _trip('2026-09-10', '2026-09-12'), // 진행중
        _trip('2026-09-20', '2026-09-22'), // 예정(가까움)
        _trip('2026-09-01', '2026-09-02'), // 지난(최근)
      ];
      final s = sortTripsForList(trips, '2026-09-11');
      expect(s.map((t) => t.startDate), [
        '2026-09-10', // 진행중
        '2026-09-20', // 예정 — 가까운 것 먼저
        '2026-10-01',
        '2026-09-01', // 지난 — 최근 것 먼저
        '2026-08-01',
      ]);
    });

    test('원본 배열을 건드리지 않는다(provider 캐시를 그대로 넘겨도 안전)', () {
      final trips = [_trip('2026-10-01', '2026-10-03'), _trip('2026-08-01', '2026-08-03')];
      final before = trips.map((t) => t.startDate).toList();
      sortTripsForList(trips, '2026-09-11');
      expect(trips.map((t) => t.startDate), before);
    });
  });

  group('stopsOfDay / notesOfDay — 계획은 events에서 도출된다', () {
    // 서울 기준 날짜다. UTC 15시 이후는 다음날이므로 여기서 어긋나면 스톱이 하루씩 밀린다.
    final events = [
      _ev('a', DateTime.utc(2026, 9, 1, 1), placeId: 'p1'), // 서울 9/1 10:00
      _ev('b', DateTime.utc(2026, 9, 1, 3), placeId: 'p2'), // 서울 9/1 12:00
      _ev('note', DateTime.utc(2026, 9, 1, 2)), // 장소 없음
      _ev('c', DateTime.utc(2026, 9, 2, 1), placeId: 'p3'), // 다른 날
      _ev('night', DateTime.utc(2026, 9, 1, 16), placeId: 'p4'), // 서울 9/2 01:00
    ];

    test('★ place_id가 있는 것만 스톱이 된다', () {
      expect(stopsOfDay(events, '2026-09-01').map((e) => e.id), ['a', 'b']);
    });

    test('스톱은 시작시각 순', () {
      final s = stopsOfDay(events, '2026-09-01');
      expect(s.first.id, 'a');
    });

    test('★ 장소 없는 일정은 메모로 갈린다 — 스톱에 섞으면 "여기도 가나?"로 읽힌다', () {
      expect(notesOfDay(events, '2026-09-01').map((e) => e.id), ['note']);
    });

    test('★ 서울 밤 시각은 다음날로 간다(UTC로 세면 하루 밀린다)', () {
      expect(stopsOfDay(events, '2026-09-01').map((e) => e.id), isNot(contains('night')));
      expect(stopsOfDay(events, '2026-09-02').map((e) => e.id), contains('night'));
    });

    test('그 날 아무것도 없으면 빈 목록(빈 Day UI가 받는다)', () {
      expect(stopsOfDay(events, '2026-09-09'), isEmpty);
    });
  });

  group('addDays', () {
    test('월·연 경계를 넘는다', () {
      expect(addDays('2026-08-31', 1), '2026-09-01');
      expect(addDays('2026-12-31', 1), '2027-01-01');
      expect(addDays('2026-01-01', -1), '2025-12-31');
    });
  });
}
