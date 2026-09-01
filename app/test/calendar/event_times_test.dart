import 'package:flutter_test/flutter_test.dart';
import 'package:weave/calendar/event_times.dart';
import 'package:weave/calendar/tz.dart';

/// 일정 시각 빌드 + 검증 — 웹판 `src/__tests__/eventTimes.test.ts`의 케이스를 전부 옮기고,
/// Dart 이식에서 새로 생긴 위험(형식 깨짐 → 예외, 월/연 경계)만큼 더 넣었다.
///
/// 이 함수가 DB `CHECK("end" >= start)`의 앞단이자 1차 방어선이라, 여기 케이스가 곧 계약이다.
void main() {
  group('buildEventTimes — 종일', () {
    test('KST 00:00 → 23:59 (다른 날 두 ISO 경계)', () {
      final r = buildEventTimes(date: '2026-06-16', allDay: true);
      expect(
        r,
        EventTimesOk(
          start: DateTime.utc(2026, 6, 15, 15, 0),
          end: DateTime.utc(2026, 6, 16, 14, 59),
        ),
      );
    });

    test('ISO 문자열도 웹판과 같은 포맷이다(서버로 이 문자열이 나간다)', () {
      final r = buildEventTimes(date: '2026-06-16', allDay: true) as EventTimesOk;
      expect(r.startIso, '2026-06-15T15:00:00.000Z');
      expect(r.endIso, '2026-06-16T14:59:00.000Z');
    });

    test('다일: start=06-16 00:00 KST, end=06-18 23:59 KST', () {
      final r = buildEventTimes(date: '2026-06-16', allDay: true, endDate: '2026-06-18');
      expect(
        r,
        EventTimesOk(
          start: DateTime.utc(2026, 6, 15, 15, 0),
          end: DateTime.utc(2026, 6, 18, 14, 59),
        ),
      );
    });

    test('endDate < date → reason:range', () {
      final r = buildEventTimes(date: '2026-06-16', allDay: true, endDate: '2026-06-14');
      expect(r, const EventTimesRejected(EventTimesReason.range));
    });

    test('endDate == date는 하루짜리로 통과한다(경계값)', () {
      final same = buildEventTimes(date: '2026-06-16', allDay: true, endDate: '2026-06-16');
      final omitted = buildEventTimes(date: '2026-06-16', allDay: true);
      expect(same, omitted);
    });

    test('endDate가 빈 문자열/공백이면 미입력과 같다', () {
      final base = buildEventTimes(date: '2026-06-16', allDay: true);
      expect(buildEventTimes(date: '2026-06-16', allDay: true, endDate: ''), base);
      expect(buildEventTimes(date: '2026-06-16', allDay: true, endDate: '   '), base);
    });

    test('종일 시작은 tz.dart의 startOfDay와 같은 시점이다(하루 경계 정의가 하나여야 한다)', () {
      final r = buildEventTimes(date: '2026-06-16', allDay: true) as EventTimesOk;
      expect(r.start, startOfDay('2026-06-16'));
      // 왕복: 만든 시점을 다시 날짜 키로 접으면 원래 날짜여야 한다(하루 밀림 0).
      expect(dayKey(r.start), '2026-06-16');
      expect(dayKey(r.end), '2026-06-16');
    });

    test('시각 입력이 있어도 종일이면 무시한다', () {
      final r = buildEventTimes(
        date: '2026-06-16',
        allDay: true,
        startTime: '10:00',
        endTime: '10:00', // 종일 경로에선 same 검사에 걸리지 않아야 한다
      );
      expect(r, buildEventTimes(date: '2026-06-16', allDay: true));
    });

    test('달을 넘는 다일(월말→다음달)', () {
      final r = buildEventTimes(date: '2026-06-29', allDay: true, endDate: '2026-07-02')
          as EventTimesOk;
      expect(dayKey(r.start), '2026-06-29');
      expect(dayKey(r.end), '2026-07-02');
    });
  });

  group('buildEventTimes — 시각', () {
    test('정상 시간: end > start', () {
      final r = buildEventTimes(
        date: '2026-06-16',
        allDay: false,
        startTime: '10:00',
        endTime: '12:00',
      ) as EventTimesOk;
      expect(r.end.isAfter(r.start), isTrue);
    });

    test('DISPLAY_TZ(+09:00)로 해석한다', () {
      final r = buildEventTimes(
        date: '2026-06-16',
        allDay: false,
        startTime: '10:00',
        endTime: '12:00',
      );
      expect(
        r,
        EventTimesOk(
          start: DateTime.utc(2026, 6, 16, 1, 0),
          end: DateTime.utc(2026, 6, 16, 3, 0),
        ),
      );
    });

    test('자정 넘김: end가 start+2h(다음날 01:00 KST)로 롤', () {
      final r = buildEventTimes(
        date: '2026-06-16',
        allDay: false,
        startTime: '23:00',
        endTime: '01:00',
      ) as EventTimesOk;
      expect(r.end, DateTime.utc(2026, 6, 16, 16, 0));
      expect(r.end.difference(r.start), const Duration(hours: 2));
    });

    test('자정 넘김이 월 경계를 넘어도 정확하다(6/30 23:00 → 7/1 01:00)', () {
      final r = buildEventTimes(
        date: '2026-06-30',
        allDay: false,
        startTime: '23:00',
        endTime: '01:00',
      ) as EventTimesOk;
      expect(dayKey(r.end), '2026-07-01');
      expect(formatTime(r.end), '01:00');
      expect(r.end.difference(r.start), const Duration(hours: 2));
    });

    test('자정 넘김이 연 경계를 넘어도 정확하다(12/31 → 1/1)', () {
      final r = buildEventTimes(
        date: '2026-12-31',
        allDay: false,
        startTime: '22:30',
        endTime: '00:30',
      ) as EventTimesOk;
      expect(dayKey(r.end), '2027-01-01');
      expect(r.end.difference(r.start), const Duration(hours: 2));
    });

    test('같은 시각: 0길이 거부 (reason:same)', () {
      final r = buildEventTimes(
        date: '2026-06-16',
        allDay: false,
        startTime: '10:00',
        endTime: '10:00',
      );
      expect(r, const EventTimesRejected(EventTimesReason.same));
    });

    test('★ 웹판과 다르게: 0패딩만 다른 같은 시각도 same으로 잡는다', () {
      // 웹판은 문자열 비교(`st === et`)라 '10:0' ≠ '10:00' → 자정 롤 → 24시간짜리가 조용히 저장된다.
      final r = buildEventTimes(
        date: '2026-06-16',
        allDay: false,
        startTime: '10:00',
        endTime: '10:0',
      );
      expect(r, const EventTimesRejected(EventTimesReason.same));
    });

    test('시각 누락/공백 → reason:missing', () {
      const d = '2026-06-16';
      expect(
        buildEventTimes(date: d, allDay: false, endTime: '12:00'),
        const EventTimesRejected(EventTimesReason.missing),
      );
      expect(
        buildEventTimes(date: d, allDay: false, startTime: '10:00'),
        const EventTimesRejected(EventTimesReason.missing),
      );
      expect(
        buildEventTimes(date: d, allDay: false, startTime: '', endTime: '12:00'),
        const EventTimesRejected(EventTimesReason.missing),
      );
      expect(
        buildEventTimes(date: d, allDay: false, startTime: '10:00', endTime: '  '),
        const EventTimesRejected(EventTimesReason.missing),
      );
    });

    test('★ 형식이 깨져도 던지지 않는다 — missing으로 거부(Dart int.parse 함정)', () {
      // JS는 Number('오전 10시')=NaN으로 흘러가지만 Dart int.parse는 FormatException을 던진다.
      // 순수 검증 함수가 예외를 뱉으면 호출부가 전부 try/catch를 써야 한다.
      expect(
        buildEventTimes(
            date: '2026-06-16', allDay: false, startTime: '오전 10시', endTime: '12:00'),
        const EventTimesRejected(EventTimesReason.missing),
      );
      expect(
        buildEventTimes(date: '어제', allDay: true),
        const EventTimesRejected(EventTimesReason.missing),
      );
      expect(
        buildEventTimes(date: '2026-06-16', allDay: true, endDate: '2026/06/18'),
        const EventTimesRejected(EventTimesReason.missing),
      );
    });

    test('분 단위 입력도 정확히 반영된다', () {
      final r = buildEventTimes(
        date: '2026-06-16',
        allDay: false,
        startTime: '09:15',
        endTime: '10:45',
      ) as EventTimesOk;
      expect(formatTime(r.start), '09:15');
      expect(formatTime(r.end), '10:45');
      expect(r.end.difference(r.start), const Duration(minutes: 90));
    });

    test('sealed이라 switch로 이유를 빠짐없이 갈라낼 수 있다(UI 메시지 분기)', () {
      String message(EventTimes t) => switch (t) {
            EventTimesOk() => '저장',
            EventTimesRejected(reason: EventTimesReason.same) => '시작과 종료가 같아요',
            EventTimesRejected(reason: EventTimesReason.range) => '종료일이 시작일보다 앞이에요',
            EventTimesRejected(reason: EventTimesReason.missing) => '시각을 확인해주세요',
          };
      expect(
        message(buildEventTimes(
            date: '2026-06-16', allDay: false, startTime: '10:00', endTime: '10:00')),
        '시작과 종료가 같아요',
      );
      expect(
        message(buildEventTimes(date: '2026-06-16', allDay: true, endDate: '2026-06-14')),
        '종료일이 시작일보다 앞이에요',
      );
    });
  });

  group('타임존 — 웹판의 tz 스루를 대체하는 대칭 보장', () {
    // 웹판은 timeZone 파라미터로 임의 IANA tz의 벽시계를 해석한다(표시 경로와 대칭).
    // Flutter는 표시가 서울 고정이라 저장도 서울 고정이어야 대칭이 선다. 그 대칭을 못박는다.
    test('★ 표시→편집→저장 왕복에서 시점이 보존된다(비-서울 tz로 만든 시각 일정도)', () {
      // 웹에서 timeZone:'UTC'로 만든 01:00~03:00 일정. 서버엔 이 두 시점이 들어 있다.
      final storedStart = DateTime.utc(2026, 6, 20, 1, 0);
      final storedEnd = DateTime.utc(2026, 6, 20, 3, 0);

      // 이 앱은 서울 벽시계로 보여준다(10:00~12:00). 사용자가 아무것도 안 고치고 저장하면…
      final rebuilt = buildEventTimes(
        date: dayKey(storedStart),
        allDay: false,
        startTime: formatTime(storedStart),
        endTime: formatTime(storedEnd),
      ) as EventTimesOk;

      // …시점이 그대로여야 한다. 무음 드리프트 0(CLAUDE.md §4.3).
      expect(rebuilt.start, storedStart);
      expect(rebuilt.end, storedEnd);
    });

    test('★ 한계 기록: 비-서울 tz의 종일 일정은 왕복 시 날짜가 늘어난다', () {
      // 문서화된 한계다(event_times.dart '알고 가는 한계'). 고쳐지면 이 테스트가 깨지고,
      // 그때는 tz.dart가 package:timezone으로 갈아탄 시점일 것이다.
      final storedStart = DateTime.utc(2026, 6, 20, 0, 0); // UTC 종일 시작
      final storedEnd = DateTime.utc(2026, 6, 20, 23, 59); // UTC 종일 끝
      expect(dayKey(storedStart), '2026-06-20');
      expect(dayKey(storedEnd), '2026-06-21'); // 서울에선 다음날로 보인다
      final rebuilt = buildEventTimes(
        date: dayKey(storedStart),
        allDay: true,
        endDate: dayKey(storedEnd),
      ) as EventTimesOk;
      expect(dayKey(rebuilt.end), '2026-06-21');
    });

    test('DST가 없다 — 여름·겨울 같은 벽시계는 같은 오프셋을 낳는다', () {
      // 고정 오프셋 가정의 근거. 깨지면 tz.dart부터 갈아타야 한다.
      final summer = buildEventTimes(
          date: '2026-07-15', allDay: false, startTime: '10:00', endTime: '11:00') as EventTimesOk;
      final winter = buildEventTimes(
          date: '2026-01-15', allDay: false, startTime: '10:00', endTime: '11:00') as EventTimesOk;
      expect(summer.start.hour, winter.start.hour); // 둘 다 01시 UTC
    });
  });

  group('followEndTime — 시작을 옮기면 종료가 따라온다(22시간 일정 방지)', () {
    test('길이를 보존한다', () {
      // 10:00~11:00(1시간)의 시작을 13:00으로 → 14:00
      expect(followEndTime('10:00', '13:00', '11:00'), '14:00');
    });

    test('회귀: 시작만 뒤로 밀어도 end<=start가 되지 않는다(예전엔 22시간짜리가 조용히 저장됐다)', () {
      final nextEnd = followEndTime('10:00', '13:00', '11:00');
      final r = buildEventTimes(
        date: '2026-07-25',
        allDay: false,
        startTime: '13:00',
        endTime: nextEnd,
      ) as EventTimesOk;
      expect(r.end.difference(r.start), const Duration(hours: 1)); // 22가 아니라 1
    });

    test('자정 넘김 길이도 보존한다(23:00~01:00 = 2시간)', () {
      expect(followEndTime('23:00', '20:00', '01:00'), '22:00');
    });

    test('따라온 종료가 자정을 넘으면 그대로 넘긴다(유효한 입력)', () {
      // 22:00~23:00(1시간)의 시작을 23:30으로 → 00:30(다음날) — buildEventTimes가 롤 처리.
      expect(followEndTime('22:00', '23:30', '23:00'), '00:30');
      final r = buildEventTimes(
        date: '2026-07-25',
        allDay: false,
        startTime: '23:30',
        endTime: '00:30',
      ) as EventTimesOk;
      expect(dayKey(r.end), '2026-07-26');
      expect(r.end.difference(r.start), const Duration(hours: 1));
    });

    test('분 단위도 정확히 따라온다', () {
      expect(followEndTime('09:15', '10:45', '10:00'), '11:30');
    });

    test('시작을 앞으로 당겨도 길이가 유지된다', () {
      expect(followEndTime('10:00', '08:30', '11:30'), '10:00');
    });

    test('형식이 깨진 입력이면 종료를 그대로 둔다(JS는 "NaN:NaN"을 만들었다)', () {
      expect(followEndTime('열시', '13:00', '11:00'), '11:00');
    });
  });
}
