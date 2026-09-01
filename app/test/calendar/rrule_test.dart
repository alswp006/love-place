import 'package:flutter_test/flutter_test.dart';
import 'package:weave/calendar/rrule.dart';
import 'package:weave/calendar/tz.dart';

/// 축소판 RRULE — 웹판 `src/__tests__/rrule.test.ts`의 케이스를 그대로 옮기고,
/// Dart 이식에서만 생기는 함정(타임존 경계·월말 오버플로·손상된 규칙 문자열)을 더 덮었다.
///
/// 이 파일이 지키는 것: **같은 규칙·같은 이벤트면 웹판과 Dart판이 같은 회차를 만든다.**
/// 한쪽만 고치면 두 앱이 같은 일정을 다른 날에 그린다.

/// 테스트용 최소 이벤트. 실제 모델은 나중에 붙지만 계약([RecurringEvent])은 이게 전부다.
class _Ev implements RecurringEvent {
  const _Ev(this.id, this.start, this.end, [this.recurrenceRule]);

  final String id;
  @override
  final DateTime start;
  @override
  final DateTime end;
  @override
  final String? recurrenceRule;
}

void main() {
  final winStart = DateTime.utc(2026, 1, 1, 0, 0, 0);
  final winEnd = DateTime.utc(2026, 12, 31, 23, 59, 59);

  group('parseRule / buildRule', () {
    test('FREQ/INTERVAL/COUNT 파싱', () {
      final r = parseRule('FREQ=WEEKLY;INTERVAL=2;COUNT=5')!;
      expect(r.freq, Freq.weekly);
      expect(r.interval, 2);
      expect(r.count, 5);
      expect(r.exdates, isEmpty);
      expect(r.until, isNull);
    });

    test('FREQ 없거나 빈 문자열이면 null(반복 아님)', () {
      expect(parseRule(null), isNull);
      expect(parseRule(''), isNull);
      expect(parseRule('INTERVAL=2'), isNull);
    });

    test('미지원 FREQ(YEARLY)는 null — 단발로 떨어진다', () {
      expect(parseRule('FREQ=YEARLY;INTERVAL=1'), isNull);
    });

    test('키는 대소문자 무시, 값은 구분 — 웹판 동작 그대로', () {
      expect(parseRule('freq=DAILY;interval=3')?.interval, 3);
      // 값을 소문자로 쓰면 웹판도 못 읽는다. 여기서 관대해지면 웹이 못 읽는 규칙이 저장된다.
      expect(parseRule('FREQ=daily'), isNull);
    });

    test('EXDATE 파싱', () {
      final r = parseRule('FREQ=DAILY;INTERVAL=1;EXDATE=2026-06-02,2026-06-03')!;
      expect(r.exdates, ['2026-06-02', '2026-06-03']);
    });

    test('EXDATE의 공백·빈 조각은 버린다', () {
      final r = parseRule('FREQ=DAILY;INTERVAL=1;EXDATE= 2026-06-02 , ,2026-06-03')!;
      expect(r.exdates, ['2026-06-02', '2026-06-03']);
    });

    test('INTERVAL이 0·음수·비숫자면 1', () {
      expect(parseRule('FREQ=DAILY;INTERVAL=0')?.interval, 1);
      expect(parseRule('FREQ=DAILY;INTERVAL=-3')?.interval, 1);
      expect(parseRule('FREQ=DAILY;INTERVAL=abc')?.interval, 1);
      expect(parseRule('FREQ=DAILY')?.interval, 1);
      // JS의 날짜 산술이 소수를 잘라내므로 여기서도 자른다(2.9 → 2).
      expect(parseRule('FREQ=DAILY;INTERVAL=2.9')?.interval, 2);
    });

    test('buildRule round-trip', () {
      final s = buildRule(Freq.monthly, 1, count: 3, exdates: ['2026-02-15']);
      final r = parseRule(s)!;
      expect(r.freq, Freq.monthly);
      expect(r.interval, 1);
      expect(r.count, 3);
      expect(r.exdates, ['2026-02-15']);
    });

    test('buildRule UNTIL 방출 round-trip — 문자열이 원문 그대로 보존된다', () {
      const until = '2026-08-01T00:00:00Z';
      final s = buildRule(Freq.weekly, 1, until: until);
      expect(s.contains('UNTIL=$until'), isTrue); // .000Z 같은 재포맷이 끼면 안 된다
      final r = parseRule(s)!;
      expect(r.freq, Freq.weekly);
      expect(r.interval, 1);
      expect(r.until, until);
    });

    test('필드 순서가 고정이다 — 같은 규칙은 두 앱에서 같은 문자열', () {
      final s = buildRule(Freq.monthly, 2,
          count: 3, exdates: ['2026-02-15', '2026-03-15'], until: '2026-08-01T00:00:00Z');
      expect(s,
          'FREQ=MONTHLY;INTERVAL=2;COUNT=3;UNTIL=2026-08-01T00:00:00Z;EXDATE=2026-02-15,2026-03-15');
    });

    test('빈 옵션은 아예 방출하지 않는다', () {
      expect(buildRule(Freq.daily, 1), 'FREQ=DAILY;INTERVAL=1');
      expect(buildRule(Freq.daily, 1, count: 0, exdates: const [], until: ''),
          'FREQ=DAILY;INTERVAL=1');
      expect(buildRule(Freq.daily, 0), 'FREQ=DAILY;INTERVAL=1'); // 1 미만은 1로
    });
  });

  group('expandOccurrences', () {
    test('매일 COUNT=3', () {
      final r = parseRule('FREQ=DAILY;INTERVAL=1;COUNT=3')!;
      final occ = expandOccurrences(DateTime.utc(2026, 6, 1, 1), r, winStart, winEnd);
      expect(occ.map(dayKey).toList(), ['2026-06-01', '2026-06-02', '2026-06-03']);
    });

    test('매주 INTERVAL=1 COUNT=3', () {
      final r = parseRule('FREQ=WEEKLY;INTERVAL=1;COUNT=3')!;
      final occ = expandOccurrences(DateTime.utc(2026, 6, 1, 1), r, winStart, winEnd);
      expect(occ.map(dayKey).toList(), ['2026-06-01', '2026-06-08', '2026-06-15']);
    });

    test('격주(INTERVAL=2)', () {
      final r = parseRule('FREQ=WEEKLY;INTERVAL=2;COUNT=3')!;
      final occ = expandOccurrences(DateTime.utc(2026, 6, 1, 1), r, winStart, winEnd);
      expect(occ.map(dayKey).toList(), ['2026-06-01', '2026-06-15', '2026-06-29']);
    });

    test('매월 COUNT=3', () {
      final r = parseRule('FREQ=MONTHLY;INTERVAL=1;COUNT=3')!;
      final occ = expandOccurrences(DateTime.utc(2026, 1, 15, 1), r, winStart, winEnd);
      expect(occ.map(dayKey).toList(), ['2026-01-15', '2026-02-15', '2026-03-15']);
    });

    test('★ 월말 오버플로는 보정하지 않는다 — 1/31 + 1개월 = 3/03 (JS와 동일)', () {
      // 2월 31일이 3월 3일로 넘어가고, 그 다음은 4월 3일이다(31일로 되돌아오지 않는다).
      // '더 옳게' 말일로 당기면 웹판과 회차가 어긋난다.
      final r = parseRule('FREQ=MONTHLY;INTERVAL=1;COUNT=3')!;
      final occ = expandOccurrences(DateTime.utc(2026, 1, 31, 1), r, winStart, winEnd);
      expect(occ.map(dayKey).toList(), ['2026-01-31', '2026-03-03', '2026-04-03']);
    });

    test('EXDATE 회차 제외 — COUNT는 지워진 회차도 소모한다', () {
      final r = parseRule('FREQ=DAILY;INTERVAL=1;COUNT=3;EXDATE=2026-06-02')!;
      final occ = expandOccurrences(DateTime.utc(2026, 6, 1, 1), r, winStart, winEnd);
      // COUNT=3인데 2개다. 빠진 자리를 뒤에서 채우지 않는 게 맞다(RFC와 같은 순서).
      expect(occ.map(dayKey).toList(), ['2026-06-01', '2026-06-03']);
    });

    test('★ EXDATE는 표시 타임존(서울) 날짜 키다 — UTC 날짜로 적으면 안 지워진다', () {
      // UTC 16:00 = 서울 다음날 01:00. 캘린더가 그리는 날짜는 서울 날짜이므로
      // EXDATE도 서울 날짜여야 한다. 여기가 어긋나면 "지웠는데 계속 뜬다" 버그가 된다.
      final start = DateTime.utc(2026, 6, 2, 16);
      expect(dayKey(start), '2026-06-03');

      final byUtcDate = parseRule('FREQ=DAILY;INTERVAL=1;COUNT=1;EXDATE=2026-06-02')!;
      expect(expandOccurrences(start, byUtcDate, winStart, winEnd), hasLength(1));

      final bySeoulDate = parseRule('FREQ=DAILY;INTERVAL=1;COUNT=1;EXDATE=2026-06-03')!;
      expect(expandOccurrences(start, bySeoulDate, winStart, winEnd), isEmpty);
    });

    test('★ EXDATE 비교 단위가 날짜라서, 시각까지 적으면 아무것도 안 지운다', () {
      // 한계 기록: EXDATE 하나는 그 날의 회차를 전부 지운다. FREQ 셋으로는 하루에 회차가
      // 둘 나올 수 없어 지금은 안 터지지만, BYDAY/시간 단위 FREQ를 더하면 터진다.
      final r = parseRule('FREQ=DAILY;INTERVAL=1;COUNT=1;EXDATE=2026-06-01T01:00:00Z')!;
      final occ = expandOccurrences(DateTime.utc(2026, 6, 1, 1), r, winStart, winEnd);
      expect(occ, hasLength(1));
    });

    test('UNTIL과 정확히 같은 시각의 회차는 포함된다', () {
      final r = parseRule('FREQ=DAILY;INTERVAL=1;UNTIL=2026-06-03T01:00:00.000Z')!;
      final occ = expandOccurrences(DateTime.utc(2026, 6, 1, 1), r, winStart, winEnd);
      expect(occ.map(dayKey).toList(), ['2026-06-01', '2026-06-02', '2026-06-03']);
    });

    test("UNTIL = 분할 회차 1ms 전 — '이후 삭제'가 그 회차를 잘라낸다", () {
      // recurrenceScope의 splitFollowing이 만드는 값과 같은 모양(1ms 전 ISO).
      final split = DateTime.utc(2026, 6, 3, 1);
      final until = split.subtract(const Duration(milliseconds: 1)).toIso8601String();
      final r = parseRule('FREQ=DAILY;INTERVAL=1;UNTIL=$until')!;
      final occ = expandOccurrences(DateTime.utc(2026, 6, 1, 1), r, winStart, winEnd);
      expect(occ.map(dayKey).toList(), ['2026-06-01', '2026-06-02']);
    });

    test('UNTIL이 파싱 불가면 제한 없음 — 던지지 않는다(웹판 NaN 동작 재현)', () {
      final r = parseRule('FREQ=DAILY;INTERVAL=1;COUNT=3;UNTIL=쓰레기')!;
      final occ = expandOccurrences(DateTime.utc(2026, 6, 1, 1), r, winStart, winEnd);
      expect(occ, hasLength(3));
    });

    test('윈도우 밖 회차는 제외(양끝 포함)', () {
      final r = parseRule('FREQ=DAILY;INTERVAL=1;COUNT=10')!;
      final ws = DateTime.utc(2026, 6, 3);
      final we = DateTime.utc(2026, 6, 5);
      final occ = expandOccurrences(DateTime.utc(2026, 6, 1, 1), r, ws, we);
      expect(occ, isNotEmpty);
      expect(occ.every((o) => !o.isBefore(ws) && !o.isAfter(we)), isTrue);
      // 6/5 회차는 01:00이라 윈도우 끝(6/5 00:00)을 넘어 빠진다 — 윈도우는 '날짜'가 아니라
      // '시각' 범위다. 호출하는 쪽에서 winEnd를 그 날 끝(23:59:59)으로 줘야 6/5가 들어온다.
      expect(occ.map(dayKey).toList(), ['2026-06-03', '2026-06-04']);
    });

    test('반환 시각은 항상 UTC(로컬 DateTime을 넣어도)', () {
      final r = parseRule('FREQ=DAILY;INTERVAL=1;COUNT=2')!;
      final localStart = DateTime.utc(2026, 6, 1, 1).toLocal();
      final occ = expandOccurrences(localStart, r, winStart, winEnd);
      expect(occ.every((o) => o.isUtc), isTrue);
      expect(occ.first, DateTime.utc(2026, 6, 1, 1));
    });

    test('COUNT 없는 무한 규칙도 3000회에서 멈춘다(안전장치)', () {
      final r = parseRule('FREQ=DAILY;INTERVAL=1')!;
      final occ = expandOccurrences(
          DateTime.utc(2020, 1, 1), r, DateTime.utc(2020, 1, 1), DateTime.utc(2050, 1, 1));
      expect(occ, hasLength(3000));
    });

    test('말도 안 되는 INTERVAL에도 크래시하지 않는다', () {
      // JS는 Invalid Date로 조용히 넘어가는 자리. Dart DateTime은 범위를 넘으면 던지므로
      // 상한을 두고 막았다 — 손상된 규칙 하나가 캘린더 전체를 죽이면 안 된다.
      final r = parseRule('FREQ=DAILY;INTERVAL=999999999999')!;
      final occ = expandOccurrences(DateTime.utc(2026, 6, 1, 1), r, winStart, winEnd);
      expect(occ, hasLength(1)); // 첫 회차만 윈도우 안
    });
  });

  group('expandEvents', () {
    test('비반복 이벤트는 윈도우 안일 때 1개, seriesStart 보존', () {
      final ev = _Ev('e1', DateTime.utc(2026, 6, 10, 1), DateTime.utc(2026, 6, 10, 2));
      final out = expandEvents([ev], winStart, winEnd);
      expect(out, hasLength(1));
      expect(out.first.seriesStart, DateTime.utc(2026, 6, 10, 1));
      expect(out.first.start, DateTime.utc(2026, 6, 10, 1));
      expect(out.first.event.id, 'e1');
    });

    test('비반복 이벤트가 윈도우 밖이면 0개', () {
      final ev = _Ev('e1', DateTime.utc(2025, 6, 10, 1), DateTime.utc(2025, 6, 10, 2));
      expect(expandEvents([ev], winStart, winEnd), isEmpty);
    });

    test('반복 이벤트는 전개되고 각 회차가 원래 길이를 유지', () {
      final ev = _Ev(
        'e2',
        DateTime.utc(2026, 6, 1, 1),
        DateTime.utc(2026, 6, 1, 2, 30), // 90분
        'FREQ=WEEKLY;INTERVAL=1;COUNT=2',
      );
      final out = expandEvents([ev], winStart, winEnd);
      expect(out, hasLength(2));
      for (final o in out) {
        expect(o.end.difference(o.start), const Duration(minutes: 90));
        // 편집은 언제나 시리즈 기준 — 회차 시각으로 덮이면 안 된다.
        expect(o.seriesStart, DateTime.utc(2026, 6, 1, 1));
        expect(o.seriesEnd, DateTime.utc(2026, 6, 1, 2, 30));
      }
      expect(out.map((o) => dayKey(o.start)).toList(), ['2026-06-01', '2026-06-08']);
    });

    test('규칙이 있어도 못 읽으면 단발로 다룬다', () {
      final ev = _Ev('e3', DateTime.utc(2026, 6, 10, 1), DateTime.utc(2026, 6, 10, 2),
          'FREQ=YEARLY;INTERVAL=1');
      final out = expandEvents([ev], winStart, winEnd);
      expect(out, hasLength(1));
      expect(out.first.start, DateTime.utc(2026, 6, 10, 1));
    });

    test('입력 순서를 보존한다(이벤트 단위로 묶여 나온다)', () {
      final a = _Ev('a', DateTime.utc(2026, 6, 1, 1), DateTime.utc(2026, 6, 1, 2),
          'FREQ=DAILY;INTERVAL=1;COUNT=2');
      final b = _Ev('b', DateTime.utc(2026, 5, 1, 1), DateTime.utc(2026, 5, 1, 2));
      final out = expandEvents([a, b], winStart, winEnd);
      // b가 시각상 앞서지만 정렬은 호출한 쪽 몫이다(웹판 동일).
      expect(out.map((o) => o.event.id).toList(), ['a', 'a', 'b']);
    });

    test('EXDATE로 지운 회차는 전개에서 빠진다(이 일정만 삭제 경로)', () {
      final ev = _Ev(
        'e4',
        DateTime.utc(2026, 6, 1, 1),
        DateTime.utc(2026, 6, 1, 2),
        'FREQ=DAILY;INTERVAL=1;COUNT=3;EXDATE=2026-06-02',
      );
      final out = expandEvents([ev], winStart, winEnd);
      expect(out.map((o) => dayKey(o.start)).toList(), ['2026-06-01', '2026-06-03']);
    });
  });
}
