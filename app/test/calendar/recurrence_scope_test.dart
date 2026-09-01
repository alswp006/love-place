import 'package:flutter_test/flutter_test.dart';

import 'package:weave/calendar/recurrence_scope.dart';
import 'package:weave/calendar/rrule.dart';
import 'package:weave/calendar/tz.dart';

/// 반복 3-범위 — 여기가 틀리면 사용자가 "하나만 고쳤는데 전부 바뀌었다"를 겪는다.
///
/// 저장 형식(EXDATE가 규칙 안, 날짜 키 단위, 필드 순서)은 웹판과 바이트 동일해야 한다.
/// 두 앱이 같은 행을 번갈아 고치므로, 형식이 갈리면 한쪽이 상대 규칙을 못 읽는다.
void main() {
  group('shiftTimesToOccurrence', () {
    // 폼은 시리즈 앵커(첫 회차) 날짜를 들고 있다. 3번째 회차를 고쳤는데 그대로 저장하면
    // override가 앵커 날짜에 떨어진다 — 엉뚱한 날에 생기고 고치려던 날은 그대로다.
    final start = DateTime.utc(2026, 6, 2, 1, 0); // 서울 10:00
    final end = DateTime.utc(2026, 6, 2, 2, 0); // 서울 11:00

    test('★ 회차 날짜로 옮기되 벽시계 시각은 보존한다', () {
      final r = shiftTimesToOccurrence(start, end, '2026-06-16');
      expect(dayKey(r.start), '2026-06-16');
      expect(formatTime(r.start), '10:00');
      expect(formatTime(r.end), '11:00');
    });

    test('길이가 유지된다', () {
      final r = shiftTimesToOccurrence(start, end, '2026-07-01');
      expect(r.end.difference(r.start), end.difference(start));
    });

    test('같은 날이면 그대로(불필요한 재계산 없음)', () {
      final r = shiftTimesToOccurrence(start, end, '2026-06-02');
      expect(r.start, start);
      expect(r.end, end);
    });

    test('과거로도 옮긴다', () {
      final r = shiftTimesToOccurrence(start, end, '2026-05-20');
      expect(dayKey(r.start), '2026-05-20');
      expect(formatTime(r.start), '10:00');
    });

    test('★ 서울 밤 시각도 날짜가 밀리지 않는다', () {
      // UTC 15시 이후는 서울 다음날이다. 여기서 UTC 날짜로 계산하면 하루씩 어긋난다.
      final night = DateTime.utc(2026, 6, 1, 16, 0); // 서울 6/2 01:00
      final r = shiftTimesToOccurrence(night, night.add(const Duration(hours: 1)), '2026-06-10');
      expect(dayKey(r.start), '2026-06-10');
      expect(formatTime(r.start), '01:00');
    });
  });

  group('exdateOccurrence', () {
    const rule = 'FREQ=WEEKLY;INTERVAL=1';

    test('그 날짜를 EXDATE에 넣는다', () {
      final out = exdateOccurrence(rule, '2026-06-09');
      expect(parseRule(out)!.exdates, ['2026-06-09']);
    });

    test('기존 EXDATE를 지우지 않고 더한다(정렬 유지)', () {
      final once = exdateOccurrence(rule, '2026-06-16');
      final twice = exdateOccurrence(once, '2026-06-09');
      expect(parseRule(twice)!.exdates, ['2026-06-09', '2026-06-16']);
    });

    test('같은 날짜를 두 번 지워도 중복되지 않는다', () {
      final once = exdateOccurrence(rule, '2026-06-09');
      expect(parseRule(exdateOccurrence(once, '2026-06-09'))!.exdates.length, 1);
    });

    test('COUNT·UNTIL 같은 다른 필드를 잃지 않는다', () {
      final out = exdateOccurrence('FREQ=DAILY;INTERVAL=2;COUNT=5', '2026-06-09');
      final p = parseRule(out)!;
      expect(p.freq, Freq.daily);
      expect(p.interval, 2);
      expect(p.count, 5);
    });

    test('규칙을 못 읽으면 원문 그대로 — 손상된 규칙이 편집을 막지 않는다', () {
      expect(exdateOccurrence('쓰레기', '2026-06-09'), '쓰레기');
    });

    test('★ 지운 회차가 실제로 전개에서 빠진다(계산이 아니라 결과로 확인)', () {
      final e = _Ev(
        DateTime.utc(2026, 6, 2, 1),
        DateTime.utc(2026, 6, 2, 2),
        rule,
      );
      final before = expandEvents<RecurringEvent>([e], DateTime.utc(2026, 6, 1), DateTime.utc(2026, 6, 30));
      final after = expandEvents<RecurringEvent>(
        [_Ev(e.start, e.end, exdateOccurrence(rule, dayKey(before[1].start)))],
        DateTime.utc(2026, 6, 1),
        DateTime.utc(2026, 6, 30),
      );
      expect(after.length, before.length - 1);
      expect(after.map(dayKeyOf), isNot(contains(dayKey(before[1].start))));
    });
  });

  group('splitFollowing', () {
    const rule = 'FREQ=WEEKLY;INTERVAL=1;COUNT=10';

    test('★ 분할 회차는 새 시리즈가 가져간다(양쪽에 뜨거나 양쪽에서 빠지지 않게)', () {
      final occ = DateTime.utc(2026, 6, 16, 1);
      final r = splitFollowing(rule, occ);
      // UNTIL이 회차 시작 1ms 전 — 경계 포함 여부가 구현에 따라 갈리는 모호함을 없앤다.
      expect(parseRule(r.truncatedRule)!.until,
          occ.subtract(const Duration(milliseconds: 1)).toIso8601String());
      expect(r.newSeriesStartKey, '2026-06-16');
    });

    test('COUNT는 버린다 — 남기면 잘린 시리즈가 UNTIL과 싸운다', () {
      final r = splitFollowing(rule, DateTime.utc(2026, 6, 16, 1));
      expect(parseRule(r.truncatedRule)!.count, isNull);
    });

    test('EXDATE는 유지한다 — 앞부분에서 지운 회차가 되살아나면 안 된다', () {
      final r = splitFollowing(
          'FREQ=WEEKLY;INTERVAL=1;EXDATE=2026-06-09', DateTime.utc(2026, 6, 23, 1));
      expect(parseRule(r.truncatedRule)!.exdates, ['2026-06-09']);
    });

    test('★ 잘린 시리즈에 분할 회차가 남지 않는다(결과로 확인)', () {
      final occ = DateTime.utc(2026, 6, 16, 1);
      final r = splitFollowing(rule, occ);
      final left = expandEvents<RecurringEvent>(
        [_Ev(DateTime.utc(2026, 6, 2, 1), DateTime.utc(2026, 6, 2, 2), r.truncatedRule)],
        DateTime.utc(2026, 6, 1),
        DateTime.utc(2026, 8, 1),
      );
      expect(left.map(dayKeyOf), isNot(contains('2026-06-16')));
      expect(left.map(dayKeyOf), contains('2026-06-09')); // 직전 회차는 남는다
    });

    test('규칙을 못 읽어도 시작 키는 준다(편집이 멈추지 않게)', () {
      final r = splitFollowing('쓰레기', DateTime.utc(2026, 6, 16, 1));
      expect(r.truncatedRule, '쓰레기');
      expect(r.newSeriesStartKey, '2026-06-16');
    });
  });
}

String dayKeyOf(Occurrence<RecurringEvent> o) => dayKey(o.start);

class _Ev implements RecurringEvent {
  _Ev(this.start, this.end, this.recurrenceRule);
  @override
  final DateTime start;
  @override
  final DateTime end;
  @override
  final String? recurrenceRule;
}
