/// 일정 시각 빌드 + 검증 — 순수 함수(테스트로 못박음).
///
/// 웹판 `src/lib/calendar/eventTimes.ts`의 이식. 폼의 벽시계 입력(날짜 키 + 'HH:mm')을
/// 서버에 보낼 실제 시점(UTC)으로 바꾸고, **저장 전에** 잘못된 범위를 걸러낸다.
///
/// ## 규칙 (웹판과 한 글자도 다르지 않다)
///
/// - 시작 == 종료 → 거부([EventTimesReason.same]). 0길이 일정은 만들 수 없다.
/// - 종일인데 종료일 < 시작일 → 거부([EventTimesReason.range]).
/// - 종료 <= 시작 → **자정 넘김**으로 해석해 종료를 다음날로 롤(23:00~01:00은 유효한 입력).
/// - 종일은 시작일 00:00 ~ 종료일 23:59(표시 타임존 벽시계).
///
/// DB의 `CHECK("end" >= start)`는 백스톱일 뿐이다. 1차 방어선이 이 함수라서, 여기서
/// 놓치면 사용자는 "저장이 안 돼요"라는 정체불명의 서버 에러를 본다.
///
/// ## 웹판과 다르게 간 곳 (의도된 divergence)
///
/// 1. **`timeZone` 파라미터를 받지 않는다.** 웹판은 임의 IANA tz의 벽시계를 해석할 수 있고
///    (`Intl.DateTimeFormat`), 표시 경로도 같은 tz로 벽시계를 채우기 때문에 저장 경로에
///    tz를 스루한다 — 그 대칭이 무음 드리프트를 막는 장치다. Flutter의 `tz.dart`는 서울
///    +09:00 고정이라 **표시 경로가 언제나 서울 벽시계**다. 그러니 저장 경로도 서울로
///    해석해야 같은 대칭이 성립한다. 여기서 tz를 받아 다르게 해석하면 오히려 "화면엔 10시,
///    저장은 01시"가 되어 드리프트가 생긴다. 파라미터를 없앤 건 기능 누락이 아니라
///    **대칭을 지키기 위한 선택**이다. (`events.time_zone` 컬럼 값은 이 함수와 무관하게
///    호출자가 그대로 실어 보내면 된다 — 저장 형식은 바뀌지 않는다.)
/// 2. **날짜 비교를 문자열이 아니라 파싱값으로 한다.** 웹판은 `endKey < input.date`로
///    사전순 비교를 하는데, 이는 키가 항상 0패딩('2026-06-01')일 때만 맞다.
///    '2026-6-1' 같은 입력이 한 번이라도 새면 조용히 오판한다. 결과는 동일하고 견고성만 는다.
/// 3. **'같은 시각' 판정을 분 단위로 한다.** 웹판은 `st === et` 문자열 비교라 '10:0'과
///    '10:00'을 다르다고 보고 → 종료<=시작 → 자정 롤 → **24시간짜리 일정이 조용히 저장된다**.
///    같은 부류의 사고를 [followEndTime] 주석이 이미 한 번 고백하고 있어서, 여기서 막는다.
/// 4. **형식이 깨진 입력은 [EventTimesReason.missing]으로 거부한다.** JS `Number('x')`는
///    NaN을 낳고 넘어가지만 Dart `int.parse`는 던진다. 순수 검증 함수가 예외를 뱉으면
///    호출부가 try/catch로 감싸야 하므로, 파싱 실패를 '입력 없음'과 같은 이유로 묶었다
///    (UI 메시지가 어차피 "시각을 확인해주세요"로 같다 — 이유를 늘리면 웹판 UI와 분기가 어긋난다).
/// 5. 반환은 `{ok: false, reason}` 객체 대신 **sealed class**다. 판정 이유는 그대로 살아 있고
///    (`switch`가 케이스 누락을 컴파일 타임에 잡는다), 성공 케이스에서만 start/end에 접근된다.
///
/// ## 알고 가는 한계
///
/// 서울 밖 타임존으로 웹에서 만든 **종일** 일정을 이 앱에서 열어 다시 저장하면 날짜 경계가
/// 밀릴 수 있다. 예: tz=UTC의 2026-06-20 종일은 06-20T00:00Z~06-20T23:59Z인데, 서울 벽시계로
/// 보면 06-20 09:00 ~ 06-21 08:59라 '이틀짜리'로 보인다. 시각 일정(비종일)은 왕복해도
/// 시점이 보존된다(테스트로 못박음). 근본 해결은 `tz.dart`를 `package:timezone`으로
/// 갈아타는 것이고, 그때 이 파일에 tz 파라미터를 되살리면 된다.
library;

import 'tz.dart';

/// 거부 사유 — UI가 이걸로 서로 다른 메시지를 낸다. 웹판의 문자열 유니온과 1:1.
enum EventTimesReason {
  /// 시작과 종료가 같은 시각(0길이).
  same,

  /// 종료일이 시작일보다 앞(종일 다일 입력의 역전).
  range,

  /// 시각이 비었거나 형식이 깨짐.
  missing,
}

/// [buildEventTimes]의 결과. 성공일 때만 시점에 접근할 수 있다.
sealed class EventTimes {
  const EventTimes();
}

/// 검증 통과 — 서버에 그대로 보낼 UTC 시점.
final class EventTimesOk extends EventTimes {
  const EventTimesOk({required this.start, required this.end});

  /// 시작 시점(UTC). 항상 `end`보다 앞선다.
  final DateTime start;

  /// 종료 시점(UTC).
  final DateTime end;

  /// 서버 컬럼에 넣을 ISO 문자열 — 웹판 `toISOString()`과 같은 포맷('...Z').
  String get startIso => start.toIso8601String();
  String get endIso => end.toIso8601String();

  @override
  bool operator ==(Object other) =>
      other is EventTimesOk && other.start == start && other.end == end;

  @override
  int get hashCode => Object.hash(start, end);

  @override
  String toString() => 'EventTimesOk($startIso ~ $endIso)';
}

/// 검증 실패 — 저장하지 않고 [reason]에 맞는 인라인 에러를 띄운다(입력값은 보존).
final class EventTimesRejected extends EventTimes {
  const EventTimesRejected(this.reason);

  final EventTimesReason reason;

  @override
  bool operator ==(Object other) =>
      other is EventTimesRejected && other.reason == reason;

  @override
  int get hashCode => reason.hashCode;

  @override
  String toString() => 'EventTimesRejected(${reason.name})';
}

final _keyRe = RegExp(r'^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$');
final _timeRe = RegExp(r'^\s*(\d{1,2}):(\d{1,2})\s*$');

/// 'YYYY-MM-DD' → (y, m, d). 형식이 아니면 null(던지지 않는다 — 위 divergence 4).
({int year, int month, int day})? _parseKey(String? key) {
  if (key == null) return null;
  final m = _keyRe.firstMatch(key);
  if (m == null) return null;
  return (year: int.parse(m[1]!), month: int.parse(m[2]!), day: int.parse(m[3]!));
}

/// 'HH:mm' → 자정부터의 분. 형식이 아니면 null.
///
/// 값 범위는 검사하지 않는다 — '25:00' 같은 입력은 [DateTime.utc]가 다음날로 정규화하고,
/// 이는 JS `Date.UTC`의 오버플로 동작과 동일하다(웹판과 결과를 맞추기 위해 남겨둔다).
int? _parseHm(String? t) {
  if (t == null) return null;
  final m = _timeRe.firstMatch(t);
  if (m == null) return null;
  return int.parse(m[1]!) * 60 + int.parse(m[2]!);
}

/// 날짜 키 + 자정부터의 분 → 실제 시점.
///
/// [DateTime.utc]에 벽시계를 담고 [fromDisplay]로 시점을 뽑는다. 오프셋 산술을 여기서
/// 직접 하지 않는 이유: 타임존 지식은 `tz.dart` 한 곳에만 둔다(나중에 `package:timezone`으로
/// 갈아탈 때 이 파일을 건드리지 않기 위해). 일/분 오버플로는 [DateTime.utc]가 정규화하므로
/// `day + 1`, `minute = 1439` 같은 표현을 그대로 쓸 수 있다(JS `Date.UTC`와 동일).
DateTime _instant(({int year, int month, int day}) k, int minuteOfDay, {int addDays = 0}) =>
    fromDisplay(DateTime.utc(k.year, k.month, k.day + addDays, 0, minuteOfDay));

/// 폼 입력 → 저장할 시점. 실패 사유는 [EventTimesRejected.reason]으로.
///
/// [date]/[endDate]는 'YYYY-MM-DD', [startTime]/[endTime]은 'HH:mm'(24시간).
/// [allDay]가 true면 시각 입력은 무시하고 [endDate]만 본다(없으면 [date] 하루).
EventTimes buildEventTimes({
  required String date,
  required bool allDay,
  String? startTime,
  String? endTime,
  String? endDate,
}) {
  final startKey = _parseKey(date);
  if (startKey == null) return const EventTimesRejected(EventTimesReason.missing);

  if (allDay) {
    // 빈 문자열/공백은 '종료일 미입력'으로 보고 하루짜리로 접는다(웹판의 truthy 체크와 동일).
    final hasEnd = endDate != null && endDate.trim().isNotEmpty;
    final endKey = hasEnd ? _parseKey(endDate) : startKey;
    if (endKey == null) return const EventTimesRejected(EventTimesReason.missing);
    if (_isBeforeKey(endKey, startKey)) {
      return const EventTimesRejected(EventTimesReason.range);
    }
    return EventTimesOk(
      start: _instant(startKey, 0),
      // 23:59 — 다음날 00:00이 아니다. 종일 일정이 다음날 칸에 번지지 않게(웹판과 동일한 선택).
      end: _instant(endKey, 23 * 60 + 59),
    );
  }

  final startMin = _parseHm(startTime);
  final endMin = _parseHm(endTime);
  if (startMin == null || endMin == null) {
    return const EventTimesRejected(EventTimesReason.missing);
  }
  if (startMin == endMin) return const EventTimesRejected(EventTimesReason.same);

  final start = _instant(startKey, startMin);
  final sameDayEnd = _instant(startKey, endMin);
  // 종료 <= 시작 → 자정 넘김. 벽시계 날짜에 하루를 더해 다시 시점을 뽑는다
  // (`start + 24h`가 아니다 — tz가 DST를 갖게 되는 날에도 '다음날 같은 시각'이 유지되도록).
  final end = sameDayEnd.isAfter(start) ? sameDayEnd : _instant(startKey, endMin, addDays: 1);
  return EventTimesOk(start: start, end: end);
}

bool _isBeforeKey(({int year, int month, int day}) a, ({int year, int month, int day}) b) {
  if (a.year != b.year) return a.year < b.year;
  if (a.month != b.month) return a.month < b.month;
  return a.day < b.day;
}

/// 시작 시각을 옮길 때 종료가 따라오게 한다 — 길이(분)를 보존한 새 'HH:mm'.
///
/// 왜 필요한가: 종료<=시작을 자정 넘김으로 해석하는 규칙 때문에, 시작을 13:00으로 바꾸고
/// 종료(11:00)를 그대로 두면 **경고 없이 22시간짜리 일정**이 저장됐다. 사용자는 '시작만
/// 옮겼다'고 생각하는데 결과가 조용히 달라지는 게 문제다. 자정 넘김 자체는 유효한
/// 입력이므로(23:00~01:00) 규칙을 없애지 않고, 시작을 움직일 때 종료를 같은 간격만큼
/// 끌고 가서 '의도치 않은' 넘김만 막는다.
///
/// 종료를 사용자가 직접 만질 때는 이 함수를 쓰지 않는다(그건 명시적 의도).
/// 파싱 불가한 입력이면 [end]를 그대로 돌려준다(JS는 'NaN:NaN'을 만들었다).
String followEndTime(String prevStart, String nextStart, String end) {
  final p = _parseHm(prevStart);
  final n = _parseHm(nextStart);
  final e = _parseHm(end);
  if (p == null || n == null || e == null) return end;

  // 원래 길이 — 자정 넘김이었으면 그 길이를 그대로 유지한다.
  final durationMin = e >= p ? e - p : 24 * 60 - p + e;
  final nextEnd = (n + durationMin) % (24 * 60);
  final h = (nextEnd ~/ 60).toString().padLeft(2, '0');
  final mi = (nextEnd % 60).toString().padLeft(2, '0');
  return '$h:$mi';
}
