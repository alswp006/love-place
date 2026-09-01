/// 반복 3-범위 연산 — 웹판 `recurrenceScope.ts`의 이식.
///
/// 반복 일정을 고칠 때 사용자는 셋 중 하나를 고른다:
///
/// | 범위 | 무슨 일이 일어나나 |
/// |---|---|
/// | `all` | 시리즈 행 하나를 그냥 update. 여기 함수가 필요 없다. |
/// | `thisOne` | 그 회차 날짜를 EXDATE에 넣어 시리즈에서 도려낸다. 수정이면 그 자리에 **비반복 행**을 새로 만든다. |
/// | `following` | 시리즈를 그 회차 직전까지로 절단(UNTIL)하고, 그 회차부터 **새 시리즈**를 만든다. |
///
/// ## 이 파일이 순수한 이유
///
/// `thisOne`·`following`은 둘 다 **쓰기가 2단계**다(기존 행 update + 새 행 insert). 그 조합은
/// 부분 실패 창이 있어 신중히 다뤄야 하는데, 계산과 섞여 있으면 어느 쪽이 틀렸는지 알 수 없다.
/// 그래서 '무엇을 쓸지'는 여기서 순수하게 정하고, '어떻게 쓸지'는 호출부가 맡는다.
library;

import 'event_days.dart';
import 'rrule.dart';

/// 사용자가 고른 편집 범위.
enum RecurrenceScope {
  /// 이 회차만.
  thisOne,

  /// 이 회차와 이후 전부.
  following,

  /// 전체 시리즈.
  all,
}

/// 폼 시각을 **클릭한 회차 날짜로 평행이동**한다.
///
/// 왜 필요한가: 폼이 들고 있는 start/end는 시리즈 앵커(첫 회차) 날짜 기준이다. 사용자가
/// 3번째 회차를 눌러 고쳤는데 그대로 저장하면 override가 **앵커 날짜에 떨어진다** —
/// 엉뚱한 날에 일정이 생기고 정작 고치려던 날은 그대로다.
///
/// 벽시계 시각과 길이는 보존하고 날짜만 옮긴다. 표시 타임존이 +09:00 고정(DST 없음)이라
/// N일치 더하기가 벽시계 시각을 흔들지 않는다 — DST가 있는 지역으로 가면 이 가정이 깨지고,
/// 그때는 tz.dart와 함께 손봐야 한다.
({DateTime start, DateTime end}) shiftTimesToOccurrence(
  DateTime start,
  DateTime end,
  String occDayKey,
) {
  final delta = diffDays(dayKey(start), occDayKey);
  if (delta == 0) return (start: start, end: end);
  final d = Duration(days: delta);
  return (start: start.add(d), end: end.add(d));
}

/// '이 회차만' — 그 날짜를 EXDATE에 넣은 규칙을 돌려준다.
///
/// 규칙을 못 읽으면(문법이 깨졌거나 비반복) **원문을 그대로** 돌려준다. 여기서 예외를 던지면
/// 손상된 규칙 하나가 편집 자체를 막는다.
///
/// ⚠️ EXDATE는 **날짜 키** 단위다. 하루에 회차가 둘이면 하나를 지울 때 둘 다 사라진다.
/// 지금 FREQ(일·주·월)로는 하루 두 회차가 안 나오지만, BYDAY나 시간 단위를 더하면 터진다.
/// 그때는 EXDATE 값을 회차 시작 시각으로 바꿔야 하고, 그건 저장 형식 변경이라 웹판과
/// **동시에** 옮겨야 한다.
String exdateOccurrence(String rule, String occDayKey) {
  final p = parseRule(rule);
  if (p == null) return rule;
  final ex = {...p.exdates, occDayKey}.toList()..sort();
  return buildRule(p.freq, p.interval,
      count: p.count, exdates: ex, until: p.until);
}

/// '이후 전부' 분할 결과.
class SplitResult {
  const SplitResult({required this.truncatedRule, required this.newSeriesStartKey});

  /// 기존 시리즈에 씌울 규칙 — 분할 회차 직전에서 끝난다.
  final String truncatedRule;

  /// 새 시리즈가 시작할 날짜 키.
  final String newSeriesStartKey;
}

/// '이후 전부' — 시리즈를 분할 회차 **직전**까지로 자르고, 그 회차부터 새 시리즈를 시작한다.
///
/// UNTIL을 회차 시작 1ms 전으로 잡는 이유: 그 회차 자체는 새 시리즈가 가져가야 하는데,
/// UNTIL을 회차 시각과 같게 두면 경계 포함 여부가 구현에 따라 갈려 회차가 **둘 다에 뜨거나
/// 둘 다에서 빠진다**. 1ms 전은 그 모호함이 없다.
///
/// COUNT는 버린다. 남겨두면 잘린 시리즈가 "몇 번 반복"을 여전히 주장해 UNTIL과 싸운다
/// (웹판과 같은 선택). EXDATE는 유지한다 — 앞부분에서 이미 지운 회차를 되살리면 안 된다.
SplitResult splitFollowing(String rule, DateTime occStart) {
  final p = parseRule(rule);
  final startKey = dayKey(occStart);
  if (p == null) {
    return SplitResult(truncatedRule: rule, newSeriesStartKey: startKey);
  }
  final until = occStart
      .toUtc()
      .subtract(const Duration(milliseconds: 1))
      .toIso8601String();
  return SplitResult(
    truncatedRule: buildRule(p.freq, p.interval,
        exdates: p.exdates, until: until),
    newSeriesStartKey: startKey,
  );
}
