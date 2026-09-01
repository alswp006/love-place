import 'package:flutter_test/flutter_test.dart';
import 'package:weave/calendar/event_days.dart';

/// 캘린더 날짜 도출 — 웹판 `src/__tests__/calendar.test.ts`의 케이스를 그대로 옮기고,
/// **Dart에서만 생기는 함정** 세 가지를 더 못박았다:
///
///   1. `List.sort`가 stable이 아니다 → 같은 시각 일정 순서가 흔들린다(40개부터 실측 재현).
///   2. `~/`가 0 방향 절단이다 → 음수 개월 이동에서 연도가 틀린다.
///   3. `%`가 유클리드다 → JS의 `((x%12)+12)%12` 관용구를 그대로 옮기면 잉여 코드가 된다.
///
/// (웹판 파일의 `deriveTrack` 그룹은 `track.ts` 소관이라 여기 없다.)
void main() {
  group('dayKey / formatTime (tz.dart 재수출 — 하루 경계)', () {
    // 재수출이 살아있는지도 같이 검증한다: 이 파일은 tz.dart를 import하지 않는다.
    test('UTC 15:00 → KST 익일 00:00 (날짜 넘어감)', () {
      expect(dayKey(DateTime.parse('2026-06-09T15:00:00Z')), '2026-06-10');
    });

    test('UTC 14:59 → KST 같은 날', () {
      expect(dayKey(DateTime.parse('2026-06-09T14:59:00Z')), '2026-06-09');
    });

    test('오프셋이 붙은 ISO도 같은 시점으로 읽는다', () {
      // 웹판은 문자열을 그대로 비교하던 자리 — Dart는 파싱해서 시점으로 다룬다.
      expect(dayKey(DateTime.parse('2026-06-10T00:00:00+09:00')), '2026-06-10');
      expect(formatTime(DateTime.parse('2026-06-10T00:00:00+09:00')), '00:00');
    });
  });

  group('ymdKey', () {
    test('한 자리 월·일에 0을 채운다(문자열 정렬·서버 비교용)', () {
      expect(ymdKey(2026, 0, 4), '2026-01-04');
      expect(ymdKey(2026, 11, 31), '2026-12-31');
    });
  });

  group('monthMatrix', () {
    test('항상 42칸(6주)', () {
      expect(monthMatrix(2026, 5), hasLength(42));
    });

    test('이번 달 칸 수 = 그 달 일수, 첫 inMonth 칸은 1일', () {
      final cells = monthMatrix(2026, 5); // 6월(30일)
      final inMonth = cells.where((c) => c.inMonth).toList();
      expect(inMonth, hasLength(30));
      expect(inMonth.first.day, 1);
      expect(inMonth.last.day, 30);
    });

    test('2월(28/29일) 경계', () {
      expect(monthMatrix(2026, 1).where((c) => c.inMonth), hasLength(28));
      expect(monthMatrix(2024, 1).where((c) => c.inMonth), hasLength(29));
    });

    test('앞 패딩은 이전 달 말일 — 그리드는 일요일에서 시작한다', () {
      // 2026-06-01은 월요일이라 앞 패딩 한 칸(5/31 일요일)이 붙는다.
      final cells = monthMatrix(2026, 5);
      expect(
        cells.first,
        const DayCell(key: '2026-05-31', day: 31, inMonth: false),
      );
      expect(cells[1].key, '2026-06-01');
    });

    test('연말 그리드는 다음 해로 넘어간다(뒤 패딩)', () {
      final cells = monthMatrix(2026, 11); // 12월
      expect(cells.last.key.startsWith('2027-01'), isTrue);
    });

    test('42칸 키가 하루도 빠짐없이 연속이다', () {
      // 칸이 하나만 어긋나도 그 주 전체 일정이 옆 칸으로 밀린다 — 가장 값비싼 버그라 못박는다.
      final cells = monthMatrix(2026, 1); // 2월(패딩이 앞뒤로 많은 달)
      for (var i = 1; i < cells.length; i++) {
        expect(diffDays(cells[i - 1].key, cells[i].key), 1,
            reason: '${cells[i - 1].key} → ${cells[i].key}');
      }
    });
  });

  group('addMonths (경계 래핑)', () {
    test('12월 +1 → 다음 해 1월', () {
      expect(addMonths(2026, 11, 1), const YearMonth(2027, 0));
    });

    test('1월 -1 → 이전 해 12월', () {
      expect(addMonths(2026, 0, -1), const YearMonth(2025, 11));
    });

    test('여러 해를 건너뛰는 음수 delta', () {
      expect(addMonths(2026, 0, -13), const YearMonth(2024, 11));
      expect(addMonths(2026, 5, 30), const YearMonth(2028, 11));
    });

    test('★ 음수 total에서도 floor로 나눈다(~/ 절단 함정)', () {
      // `total ~/ 12`로 쓰면 여기서 year가 0이 나온다(0 방향 절단). floor여야 -1.
      // 실사용 범위 밖의 연도지만, 나눗셈이 틀렸다는 증거로는 가장 싸다.
      expect(addMonths(0, 0, -1), const YearMonth(-1, 11));
    });

    test('month는 1-based로 꺼낼 수 있다(DateTime에 그대로 넣는 값)', () {
      expect(addMonths(2026, 11, 1).month, 1);
    });
  });

  group('groupByDay', () {
    test('날짜별 버킷 + 각 날짜 시작시각 순 정렬', () {
      final events = [
        _Ev('b', '2026-06-10T05:00:00Z'),
        _Ev('a', '2026-06-10T01:00:00Z'),
        _Ev('c', '2026-06-11T01:00:00Z'),
      ];
      final grouped = groupByDay(events, (e) => e.start);
      expect(grouped['2026-06-10']?.map((e) => e.id), ['a', 'b']);
      expect(grouped['2026-06-11']?.map((e) => e.id), ['c']);
    });

    test('버킷은 서울 기준이다 — UTC 15시 일정은 다음 날로 간다', () {
      final events = [_Ev('late', '2026-06-10T15:00:00Z')];
      final grouped = groupByDay(events, (e) => e.start);
      expect(grouped.keys, ['2026-06-11']);
    });

    test('★ 같은 시각 일정의 입력 순서를 지킨다(Dart sort는 stable이 아니다)', () {
      // 40개부터 dual-pivot quicksort가 순서를 흔든다(실측: 첫 원소가 x13으로 바뀜).
      // 안정화가 없으면 Realtime 갱신마다 목록이 요동친다.
      final events = List.generate(40, (i) => _Ev('e$i', '2026-06-10T01:00:00Z'));
      final grouped = groupByDay(events, (e) => e.start);
      expect(
        grouped['2026-06-10']?.map((e) => e.id).toList(),
        List.generate(40, (i) => 'e$i'),
      );
    });

    test('맵의 키 순서도 시간순이다(아젠다가 재정렬 없이 쓴다)', () {
      final events = [
        _Ev('c', '2026-06-12T01:00:00Z'),
        _Ev('a', '2026-06-10T01:00:00Z'),
        _Ev('b', '2026-06-11T01:00:00Z'),
      ];
      expect(groupByDay(events, (e) => e.start).keys.toList(),
          ['2026-06-10', '2026-06-11', '2026-06-12']);
    });

    test('빈 입력 → 빈 맵(빈 상태 화면이 null을 만나지 않는다)', () {
      expect(groupByDay(<_Ev>[], (e) => e.start), isEmpty);
    });
  });

  group('diffDays / dDayLabel', () {
    test('일수 차(to - from)', () {
      expect(diffDays('2026-06-10', '2026-06-13'), 3);
      expect(diffDays('2026-06-10', '2026-06-09'), -1);
      expect(diffDays('2026-06-30', '2026-07-01'), 1); // 월 경계
      expect(diffDays('2026-12-31', '2027-01-01'), 1); // 연 경계
      expect(diffDays('2026-06-10', '2026-06-10'), 0);
    });

    test('윤달을 건너뛰어도 정확하다', () {
      expect(diffDays('2024-02-28', '2024-03-01'), 2); // 2/29 포함
      expect(diffDays('2026-02-28', '2026-03-01'), 1);
    });

    test('D-day 라벨', () {
      expect(dDayLabel('2026-06-10', '2026-06-10'), '오늘');
      expect(dDayLabel('2026-06-11', '2026-06-10'), '내일');
      expect(dDayLabel('2026-06-13', '2026-06-10'), 'D-3');
      expect(dDayLabel('2026-06-08', '2026-06-10'), '2일 전');
    });

    test('망가진 키는 조용히 넘어가지 않고 던진다(웹판은 NaN)', () {
      expect(() => diffDays('2026-06', '2026-06-10'), throwsFormatException);
      expect(() => diffDays('2026-06-10', 'oops'), throwsFormatException);
    });
  });

  group('weekMatrix (주 7일 — 일요일 시작)', () {
    test('화요일 앵커 → 일요일 시작 7칸', () {
      final cells = weekMatrix('2026-06-16'); // 화요일
      expect(cells, hasLength(7));
      expect(cells.first,
          const DayCell(key: '2026-06-14', day: 14, inMonth: true));
      expect(cells.last.key, '2026-06-20');
      // DayCell 재사용 — 주 뷰에서 inMonth는 의미 없음 → 전부 true(웹판과 동일).
      expect(cells.every((c) => c.inMonth), isTrue);
    });

    test('앵커가 일요일이면 그 날이 첫 칸', () {
      expect(weekMatrix('2026-06-14').first.key, '2026-06-14');
    });

    test('월을 가로지르는 주도 이어붙는다', () {
      final cells = weekMatrix('2026-07-01'); // 수요일
      expect(cells.first.key, '2026-06-28');
      expect(cells.last.key, '2026-07-04');
      expect(cells[3].day, 1); // 7/1
    });
  });

  group('minuteOfDay (타임라인 세로 위치)', () {
    test('UTC 01:30 → KST 10:30 = 630분', () {
      expect(minuteOfDay(DateTime.parse('2026-06-16T01:30:00Z')), 630);
    });

    test('UTC 15:00 → KST 익일 00:00 = 0분', () {
      expect(minuteOfDay(DateTime.parse('2026-06-15T15:00:00Z')), 0);
    });
  });

  group('upcomingEvents', () {
    test('지금 이후 일정만 시작 순으로', () {
      final now = DateTime.parse('2026-06-10T03:00:00Z');
      final events = [
        _Ev('past', '2026-06-10T01:00:00Z'),
        _Ev('soon', '2026-06-10T05:00:00Z'),
        _Ev('later', '2026-06-12T05:00:00Z'),
      ];
      expect(upcomingEvents(events, now, (e) => e.start).map((e) => e.id),
          ['soon', 'later']);
    });

    test('지금과 정확히 같은 시각은 포함(웹판 >= 와 동일 경계)', () {
      final now = DateTime.parse('2026-06-10T03:00:00Z');
      final events = [_Ev('nowish', '2026-06-10T03:00:00Z')];
      expect(upcomingEvents(events, now, (e) => e.start).map((e) => e.id),
          ['nowish']);
    });

    test('전부 과거면 빈 리스트(오늘 카드의 빈 상태)', () {
      final now = DateTime.parse('2026-06-10T03:00:00Z');
      final events = [_Ev('past', '2026-06-09T01:00:00Z')];
      expect(upcomingEvents(events, now, (e) => e.start), isEmpty);
    });

    test('같은 시각끼리는 입력 순서를 지킨다', () {
      final now = DateTime.parse('2026-06-10T00:00:00Z');
      final events =
          List.generate(40, (i) => _Ev('e$i', '2026-06-10T05:00:00Z'));
      expect(upcomingEvents(events, now, (e) => e.start).map((e) => e.id),
          List.generate(40, (i) => 'e$i'));
    });
  });
}

/// 최소 이벤트 스텁 — 실제 모델은 아직 없다. 서버가 주는 그대로 ISO 문자열을 들고 있다가
/// 추출 함수에서 파싱하는, 실제 호출부와 같은 모양이다.
class _Ev {
  _Ev(this.id, String startIso) : start = DateTime.parse(startIso);
  final String id;
  final DateTime start;
}
