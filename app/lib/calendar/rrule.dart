/// 반복 일정(축소판 RRULE) — 캘린더의 심장. 순수 함수만 있다.
///
/// 웹판 `src/lib/calendar/rrule.ts`의 1:1 이식. FREQ(DAILY/WEEKLY/MONTHLY)·INTERVAL·
/// COUNT·UNTIL·EXDATE만 지원하고 BYDAY·BYMONTHDAY·RECURRENCE-ID는 없다(v1은 시리즈 편집 모델).
///
/// ## 왜 표준 RRULE 라이브러리를 안 쓰나
///
/// 우리 규칙 문자열은 **비표준**이다. RFC 5545에서 EXDATE는 RRULE과 나란히 놓이는 별도
/// 프로퍼티인데, 우리는 `FREQ=DAILY;INTERVAL=1;EXDATE=2026-06-02` 처럼 **규칙 문자열 안에**
/// 끼워 넣는다(컬럼 하나 `events.recurrence_rule`에 다 담으려고). 게다가 EXDATE 값이
/// RFC의 DATE-TIME(`20260602T010000Z`)이 아니라 **표시 타임존 날짜 키 `YYYY-MM-DD`**다.
/// 표준 파서에 물리면 둘 다 어긋난다. 저장 형식은 웹판과 바이트 단위로 같아야 하므로
/// (같은 행을 두 앱이 읽고 쓴다) 손으로 만든 이 파서를 그대로 옮긴다.
///
/// ## 시간 계산 규칙
///
/// 회차 전진은 **UTC 달력** 기준이다(웹판의 `setUTCDate`/`setUTCMonth`와 동일). 반면
/// EXDATE 대조와 날짜 표시는 **표시 타임존**([dayKey], 서울) 기준이다. 이 비대칭은
/// 의도된 것이며 웹판과 같다 — 여기를 '더 옳게' 고치면 두 앱이 같은 이벤트를 다른 날짜에
/// 그리기 시작한다.
library;

import 'tz.dart';

/// COUNT가 없는 규칙의 전개 상한(웹판 동일). 무한 규칙이 메모리를 먹지 않게 하는 안전장치.
const _defaultMaxCount = 10000;

/// 루프 절대 상한(웹판 동일). COUNT가 아무리 커도 한 번 호출에 3000회차를 넘지 않는다.
const _hardIterationCap = 3000;

/// INTERVAL 상한.
///
/// 웹과 갈린 지점: JS는 말도 안 되는 간격(예: `INTERVAL=1e18`)을 더해도 Invalid Date가 되어
/// 조용히 넘어가지만, Dart `DateTime`은 표현 범위를 벗어나면 **던진다**. 손상된 규칙 문자열
/// 하나가 캘린더 전체를 크래시내지 않도록 상한을 둔다. 이 값이면 DAILY/WEEKLY/MONTHLY
/// 어느 쪽으로 한 번 전진해도 DateTime 범위 안이다.
const _maxInterval = 100000;

/// 반복 주기. wire 값은 규칙 문자열에 그대로 들어가는 토큰이다.
enum Freq {
  daily('DAILY'),
  weekly('WEEKLY'),
  monthly('MONTHLY');

  const Freq(this.wire);

  /// 저장·전송되는 토큰. 바꾸면 기존 행이 안 읽힌다.
  final String wire;

  /// 알 수 없는 값이면 null. **대소문자를 구분한다** — 웹판이 `freq !== 'DAILY'`로
  /// 값을 그대로 비교하기 때문. `FREQ=daily`는 양쪽 모두 "반복 아님"으로 떨어진다.
  static Freq? fromWire(String? raw) {
    for (final f in Freq.values) {
      if (f.wire == raw) return f;
    }
    return null;
  }
}

/// 파싱된 규칙.
class ParsedRule {
  const ParsedRule({
    required this.freq,
    required this.interval,
    this.count,
    this.until,
    this.exdates = const [],
  });

  final Freq freq;

  /// 항상 1 이상.
  final int interval;

  /// 전체 회차 수 상한. null이면 무제한(= [_defaultMaxCount]까지).
  final int? count;

  /// 시리즈 절단 시각 — **원문 문자열 그대로** 보관한다.
  ///
  /// 왜 DateTime이 아닌가: [buildRule]이 이 값을 가공 없이 다시 내보내야 웹판이 쓴 문자열이
  /// 왕복에서 변형되지 않는다. `DateTime.parse` → `toIso8601String()`을 거치면
  /// `...T00:00:00Z`가 `...T00:00:00.000Z`로 바뀌어 같은 규칙이 다른 문자열이 된다.
  /// 실제 시각이 필요한 곳은 [expandOccurrences] 하나뿐이라 거기서만 파싱한다.
  final String? until;

  /// 제외할 **표시 타임존 날짜 키**('YYYY-MM-DD') 목록. 시각이 아니라 날짜다.
  final List<String> exdates;

  @override
  String toString() =>
      'ParsedRule(${freq.wire}, interval: $interval, count: $count, '
      'until: $until, exdates: $exdates)';
}

/// 규칙 문자열 파싱. 반복이 아니거나(빈 값) FREQ를 못 읽으면 null.
///
/// 키는 대소문자를 무시하지만(`freq=DAILY` 가능) **값은 구분한다**(웹판 동작 그대로).
ParsedRule? parseRule(String? text) {
  if (text == null || text.isEmpty) return null;

  final map = <String, String>{};
  for (final part in text.split(';')) {
    // JS의 `const [k, v] = part.split('=')`와 같게 앞의 두 조각만 본다.
    // 'A=B=C'는 값이 'B'가 된다 — 우리 값(ISO 시각·날짜 키)에는 '='이 없어 문제되지 않는다.
    final seg = part.split('=');
    if (seg.length < 2) continue;
    final k = seg[0].trim().toUpperCase();
    final v = seg[1].trim();
    if (k.isEmpty || v.isEmpty) continue;
    map[k] = v;
  }

  final freq = Freq.fromWire(map['FREQ']);
  if (freq == null) return null;

  final exRaw = map['EXDATE'];
  return ParsedRule(
    freq: freq,
    interval: _positiveIntOr1(map['INTERVAL']),
    count: map['COUNT'] == null ? null : _positiveIntOr1(map['COUNT']),
    until: map['UNTIL'],
    exdates: exRaw == null
        ? const []
        : exRaw.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList(),
  );
}

/// 규칙 문자열 생성.
///
/// 필드 순서(FREQ;INTERVAL;COUNT;UNTIL;EXDATE)는 웹판과 같게 **고정**이다. 파서는 순서를
/// 안 타지만, 같은 규칙이 두 앱에서 같은 문자열로 저장돼야 낙관적 락의 무의미한 충돌과
/// "상대가 방금 뭘 바꿨지?" 오탐이 없다.
///
/// 인자 순서도 웹판 `buildRule(freq, interval, count, exdates, until)`을 따랐다.
String buildRule(
  Freq freq,
  int interval, {
  int? count,
  List<String>? exdates,
  String? until,
}) {
  final buf = StringBuffer('FREQ=${freq.wire};INTERVAL=${interval < 1 ? 1 : interval}');
  if (count != null && count > 0) buf.write(';COUNT=$count');
  if (until != null && until.isNotEmpty) buf.write(';UNTIL=$until');
  if (exdates != null && exdates.isNotEmpty) buf.write(';EXDATE=${exdates.join(',')}');
  return buf.toString();
}

/// [start]부터 규칙대로 전개해 `[winStart, winEnd]`(양끝 포함) 안의 회차 시작 시각들.
///
/// 반환값은 항상 UTC. COUNT·UNTIL·EXDATE가 모두 적용된다.
///
/// **COUNT는 EXDATE로 지워진 회차도 소모한다**(RFC와 같은 순서: 먼저 COUNT만큼 만들고,
/// 그중 EXDATE에 걸린 것을 뺀다). `COUNT=3`에 EXDATE 하나면 결과는 2개다.
///
/// **EXDATE 대조는 날짜 키([dayKey]) 단위다.** 즉 하루에 회차가 둘이면 EXDATE 하나가
/// **둘 다** 지운다. 지금 지원하는 FREQ 셋(DAILY/WEEKLY/MONTHLY)으로는 하루에 두 회차가
/// 나올 수 없어 드러나지 않지만, BYDAY나 시간 단위 FREQ를 더하는 순간 터진다. 그때는
/// EXDATE 값을 날짜 키가 아니라 회차 시작 시각으로 바꿔야 하고, 그건 저장 형식 변경이라
/// 웹판과 동시에 마이그레이션해야 한다.
List<DateTime> expandOccurrences(
  DateTime start,
  ParsedRule rule,
  DateTime winStart,
  DateTime winEnd,
) {
  final out = <DateTime>[];

  // 파싱 실패 = 제한 없음. 웹판은 `new Date('쓰레기').getTime()`이 NaN이 되고 `t > NaN`이
  // 항상 false라 사실상 무제한이 된다. 던지지 않고 그 동작을 그대로 재현한다.
  final until = rule.until == null ? null : DateTime.tryParse(rule.until!)?.toUtc();

  final requested = rule.count ?? _defaultMaxCount;
  final limit = requested < _hardIterationCap ? requested : _hardIterationCap;
  final exset = rule.exdates.toSet();

  var occ = start.toUtc();
  for (var i = 0; i < limit; i++) {
    if (until != null && occ.isAfter(until)) break;
    if (occ.isAfter(winEnd)) break; // 윈도우를 넘어가면 이후 회차는 볼 필요 없다(단조 증가)
    if (!occ.isBefore(winStart) && !exset.contains(dayKey(occ))) {
      out.add(occ);
    }
    occ = _advance(occ, rule.freq, rule.interval);
  }
  return out;
}

/// 다음 회차. **UTC 달력** 기준(웹판 `setUTCDate`/`setUTCMonth` 대응).
///
/// 월 전진의 오버플로는 JS와 Dart가 똑같이 동작한다: 1/31 + 1개월 → 2/31 → **3/03**.
/// 일부러 보정하지 않는다 — 웹판이 그렇게 굴러가고 있고, 여기서만 "말일로 당기기"를 하면
/// 같은 이벤트가 두 앱에서 다른 날에 뜬다.
///
/// 알고 가는 한계: 월 전진이 UTC 필드 기준이라, 서울 기준 밤 시간대(UTC 15시 이후) 일정은
/// 월말 오버플로가 서울 날짜로 보면 하루 더 밀려 보일 수 있다. 웹판과 동일한 한계다.
DateTime _advance(DateTime d, Freq freq, int interval) {
  switch (freq) {
    case Freq.daily:
      return d.add(Duration(days: interval));
    case Freq.weekly:
      return d.add(Duration(days: 7 * interval));
    case Freq.monthly:
      return DateTime.utc(
        d.year,
        d.month + interval, // 12 초과·말일 초과는 Dart가 JS와 같은 방식으로 넘긴다
        d.day,
        d.hour,
        d.minute,
        d.second,
        d.millisecond,
        d.microsecond,
      );
  }
}

/// JS `Math.max(1, Number(v ?? '1') || 1)`의 Dart 대응. INTERVAL·COUNT가 같이 쓴다.
///
/// 숫자가 아니거나(NaN) 0·음수면 1. 소수는 JS의 날짜 산술이 정수로 자르므로 여기서도 자른다.
/// 상한([_maxInterval])은 INTERVAL 때문에 필요한 것이고, COUNT에는 어차피 루프 상한
/// ([_hardIterationCap])이 먼저 걸려 영향이 없다.
/// (JS와 미세하게 다른 곳: '0x10'을 JS는 16으로 읽지만 Dart `num.tryParse`는 못 읽어 1이 된다.
///  우리 규칙 생성기가 16진수를 쓸 일이 없어 그대로 둔다.)
int _positiveIntOr1(String? raw) {
  if (raw == null) return 1;
  final n = num.tryParse(raw);
  if (n == null || n.isNaN || !n.isFinite || n < 1) return 1;
  final t = n.truncate();
  return t > _maxInterval ? _maxInterval : t;
}

/// [expandEvents]에 넣을 이벤트가 만족해야 하는 최소 계약.
///
/// 웹판은 구조적 타이핑으로 `{ start, end, recurrence_rule }`만 요구했다. Dart에는 그게
/// 없어 인터페이스로 명시한다. 컬럼명은 DB가 snake_case(`recurrence_rule`)지만 Dart 쪽
/// 게터는 lowerCamelCase로 둔다 — 저장 형식이 아니라 코드 규약이라 바꿔도 상호운용에 무해하다.
abstract interface class RecurringEvent {
  /// 시리즈 시작(= 첫 회차 후보). 반복이 아니면 그냥 시작 시각.
  DateTime get start;

  /// 시리즈 종료. 회차 길이는 여기서 [start]를 뺀 값이다.
  DateTime get end;

  /// 규칙 문자열. null이거나 파싱 실패면 단발 일정으로 다룬다.
  String? get recurrenceRule;
}

/// 화면에 그릴 한 회차.
///
/// 웹과 갈린 지점: 웹판은 `{...e, start, end, _seriesStart, _seriesEnd}`로 **이벤트를 복사해
/// 시각만 덮어썼다**. Dart엔 임의 객체 스프레드가 없어서, 복사 대신 원본을 [event]로 들고
/// 회차 시각을 옆에 붙이는 래퍼로 갔다. 모든 모델에 copyWith를 강요하지 않는 대신,
/// **`occ.start`는 회차 시각이고 `occ.event.start`는 시리즈 시작**이라는 구분이 생긴다.
/// 편집은 언제나 시리즈 기준이므로 [seriesStart]/[seriesEnd]로도 읽을 수 있게 뒀다.
class Occurrence<T extends RecurringEvent> {
  const Occurrence({
    required this.event,
    required this.start,
    required this.end,
  });

  /// 시리즈 원본. 제목·장소 등 나머지 필드는 여기서 읽는다.
  final T event;

  /// 이 회차의 시작.
  final DateTime start;

  /// 이 회차의 끝(= 시작 + 시리즈 길이).
  final DateTime end;

  /// 시리즈 원본 시작 — 편집·저장은 이 값을 기준으로 한다(웹판 `_seriesStart`).
  DateTime get seriesStart => event.start;

  /// 시리즈 원본 끝(웹판 `_seriesEnd`).
  DateTime get seriesEnd => event.end;
}

/// 이벤트들을 `[winStart, winEnd]` 윈도우의 표시용 회차로 전개.
///
/// 반복이면 여러 개로, 단발이면 윈도우 안일 때 1개. 입력 순서를 보존한다(이벤트 단위로 묶여
/// 나오므로, 시각 순으로 그리려면 호출한 쪽에서 정렬한다 — 웹판도 동일).
///
/// 웹과 갈린 지점: 웹판은 단발 이벤트의 윈도우 판정을 **ISO 문자열 사전순 비교**로 했다.
/// 포맷이 하나라도 다르면(오프셋 표기, 밀리초 유무) 조용히 어긋난다. 여기서는 DateTime
/// 비교라 그 함정이 없다. 양끝 포함 판정은 웹판과 같다.
List<Occurrence<T>> expandEvents<T extends RecurringEvent>(
  List<T> events,
  DateTime winStart,
  DateTime winEnd,
) {
  final out = <Occurrence<T>>[];
  for (final e in events) {
    final rule = parseRule(e.recurrenceRule);
    if (rule == null) {
      if (!e.start.isBefore(winStart) && !e.start.isAfter(winEnd)) {
        out.add(Occurrence(event: e, start: e.start, end: e.end));
      }
      continue;
    }
    final dur = e.end.difference(e.start); // 회차 길이는 시리즈 길이를 그대로 유지
    for (final occStart in expandOccurrences(e.start, rule, winStart, winEnd)) {
      out.add(Occurrence(event: e, start: occStart, end: occStart.add(dur)));
    }
  }
  return out;
}
