/// 캘린더 날짜 도출 — 순수 함수. 웹판 `src/lib/calendar/eventDays.ts`의 이식.
///
/// 두 단말이 **같은 날짜 버킷**을 봐야 한다(§5.1 "타임존 어긋남 0"). 그래서 하루 경계 계산은
/// 전부 [tz.dart]를 통과한다 — 웹판의 `Intl.DateTimeFormat({timeZone})` 자리를 그게 대신한다.
///
/// ## 웹판과 의도적으로 다른 곳
///
/// | 웹판 | 여기 | 왜 |
/// |---|---|---|
/// | `dayKey(iso, tz)` — tz 인자 | `dayKey(DateTime)` — 서울 고정 | tz.dart가 고정 오프셋 구현. 인자를 남기면 "지원하는 척"이 된다 |
/// | ISO **문자열** 입출력 | 시점은 `DateTime`, 날짜 키만 `String` | tz.dart의 계약이 DateTime. 문자열은 경계(모델 파싱)에서 한 번만 다룬다 |
/// | `a.start.localeCompare(b.start)` | `DateTime.compareTo` | 문자열 비교는 `+09:00`과 `Z`가 섞이면 틀린 순서를 낸다. 시점 비교는 안 틀린다 |
/// | `Array.sort`(ES2019부터 stable) | 직접 안정화 | **Dart `List.sort`는 stable이 아니다** — 같은 값 40개에서 순서가 뒤집히는 것을 실측했다. 같은 시각 일정의 표시 순서가 리렌더마다 흔들리면 안 되므로 원래 인덱스로 tie-break |
/// | `Math.floor(total / 12)` | 직접 floorDiv | Dart `~/`는 0 방향 절단, `%`는 항상 음수가 아니다. JS의 `((x%12)+12)%12` 관용구는 Dart에선 불필요하고 `~/`는 음수에서 틀린다 |
/// | 잘못된 키 → 조용히 `NaN` | `FormatException` | 하루가 밀린 화면을 디버깅하느니 즉시 터지는 편이 낫다 |
///
/// ## 유지한 것 (바꾸면 웹판과 갈라진다)
///
/// - **`month0`은 0-based**(0=1월). Dart `DateTime.month`는 1-based라 섞기 쉬운데,
///   웹판 테스트·호출부와 숫자를 맞추려고 그대로 뒀다. 인자명이 `month0`인 이유이고
///   [monthMatrix]에 `assert`를 걸어 1-based 오용을 디버그 빌드에서 잡는다.
/// - 월 그리드는 **항상 42칸(6주)**, **일요일 시작**. 주 그리드는 7칸.
/// - 그리드 라벨 산술은 UTC로 한다(로컬 tz 흔들림 방지). 라벨일 뿐이고,
///   실제 **버킷**은 [dayKey]가 표시 tz로 정한다 — 이 분리는 웹판 주석 그대로다.
///
/// ## 한계
///
/// 이벤트별 `time_zone`(여행 현지시각 표시)은 여기서도 반영하지 않는다 — tz.dart의 한계를
/// 그대로 물려받는다. 웹판의 `tzLabel.ts`(다른 tz 이벤트에 주석 뱃지) 대응물은 아직 없다.
library;

import 'tz.dart' as tz;

// 하루 경계·시각 포맷은 tz.dart가 정본이다. 같은 계산을 여기 또 두면 반드시 갈라지므로
// 재수출만 한다 — 호출부는 웹판처럼 `event_days.dart` 하나만 import하면 된다.
export 'tz.dart' show displayTz, dayKey, formatTime, minuteOfDay;

/// 'YYYY-MM-DD' 날짜 키 조립. [month0]은 0-based(0=1월).
String ymdKey(int year, int month0, int day) {
  assert(month0 >= 0 && month0 <= 11, 'month0은 0-based다(0=1월). 받은 값: $month0');
  return '${year.toString().padLeft(4, '0')}-'
      '${(month0 + 1).toString().padLeft(2, '0')}-'
      '${day.toString().padLeft(2, '0')}';
}

/// 그리드 한 칸. [inMonth]가 false면 앞뒤 패딩(이웃 달의 날짜)이다.
class DayCell {
  const DayCell({required this.key, required this.day, required this.inMonth});

  /// 'YYYY-MM-DD'.
  final String key;

  /// 그 달의 일(1..31). 화면에 찍는 숫자.
  final int day;

  /// 이번 달 소속 여부 — 흐리게 그릴지 판단용.
  final bool inMonth;

  @override
  bool operator ==(Object other) =>
      other is DayCell &&
      other.key == key &&
      other.day == day &&
      other.inMonth == inMonth;

  @override
  int get hashCode => Object.hash(key, day, inMonth);

  @override
  String toString() => 'DayCell($key, day: $day, inMonth: $inMonth)';
}

/// 월 그리드 42칸(6주×7, 일요일 시작). [month0]은 0-based.
///
/// 42칸 고정이라 달을 넘겨도 그리드 높이가 안 변한다(웹판과 동일 — 스크롤 점프 방지).
List<DayCell> monthMatrix(int year, int month0) {
  assert(month0 >= 0 && month0 <= 11, 'month0은 0-based다(0=1월). 받은 값: $month0');
  // Dart weekday는 1=월..7=일. JS getUTCDay()의 0=일..6=토로 맞추려고 %7.
  final firstDow = DateTime.utc(year, month0 + 1, 1).weekday % 7;
  // day 0 = 앞 달의 말일. Dart도 JS처럼 범위 밖 값을 정규화한다(실측 확인).
  final daysInMonth = DateTime.utc(year, month0 + 2, 0).day;
  final cells = <DayCell>[];

  // 앞 패딩(이전 달 말일들) — 음수 day도 정규화된다.
  for (var i = firstDow - 1; i >= 0; i--) {
    final d = DateTime.utc(year, month0 + 1, -i);
    cells.add(DayCell(
      key: ymdKey(d.year, d.month - 1, d.day),
      day: d.day,
      inMonth: false,
    ));
  }
  // 이번 달
  for (var day = 1; day <= daysInMonth; day++) {
    cells.add(DayCell(key: ymdKey(year, month0, day), day: day, inMonth: true));
  }
  // 뒤 패딩(다음 달 초)으로 42칸 채움
  var next = 1;
  while (cells.length < 42) {
    final d = DateTime.utc(year, month0 + 2, next);
    cells.add(DayCell(
      key: ymdKey(d.year, d.month - 1, d.day),
      day: d.day,
      inMonth: false,
    ));
    next++;
  }
  return cells;
}

/// [anchorKey]('YYYY-MM-DD')가 속한 주 7칸(일요일 시작).
///
/// `inMonth`는 전부 true다 — [DayCell]을 재사용하느라 남은 필드고 주 뷰에선 의미가 없다
/// (웹판과 동일하게 유지: 두 판의 스냅샷이 갈라지지 않게).
List<DayCell> weekMatrix(String anchorKey) {
  final (y, m, d) = _parseKey(anchorKey);
  final dow = DateTime.utc(y, m, d).weekday % 7;
  return [
    for (var i = 0; i < 7; i++)
      () {
        final cur = DateTime.utc(y, m, d - dow + i);
        return DayCell(
          key: ymdKey(cur.year, cur.month - 1, cur.day),
          day: cur.day,
          inMonth: true,
        );
      }(),
  ];
}

/// (year, month0) 쌍. [addMonths]의 반환형.
class YearMonth {
  const YearMonth(this.year, this.month0);

  final int year;

  /// 0-based(0=1월).
  final int month0;

  /// 1-based 월 — `DateTime(year, month, 1)`에 그대로 넣으라고 둔 것.
  int get month => month0 + 1;

  @override
  bool operator ==(Object other) =>
      other is YearMonth && other.year == year && other.month0 == month0;

  @override
  int get hashCode => Object.hash(year, month0);

  @override
  String toString() => 'YearMonth($year, month0: $month0)';
}

/// 달 이동(연 경계 래핑). [delta]는 음수 가능.
///
/// 총 개월 수로 환산해 한 번에 나눈다 — 12로 나눈 나머지가 곧 월이라 12월+1 같은 경계에
/// 분기가 필요 없다.
YearMonth addMonths(int year, int month0, int delta) {
  final total = year * 12 + month0 + delta;
  // Dart의 %는 유클리드라 음수 total에서도 0..11이다(JS와 다르다 — 거기선 -1%12 == -1).
  final m = total % 12;
  // ~/는 0 방향 절단이라 음수에서 틀린다. total에서 나머지를 뺀 뒤 나누면 floor와 같다.
  final y = (total - m) ~/ 12;
  return YearMonth(y, m);
}

/// 두 날짜 키 사이 일수(to - from). 음수면 과거.
///
/// 둘 다 UTC 자정으로 놓고 빼므로 DST·오프셋이 개입하지 않는다(표시 tz가 뭐든 날짜 차는 같다).
int diffDays(String fromKey, String toKey) {
  final (fy, fm, fd) = _parseKey(fromKey);
  final (ty, tm, td) = _parseKey(toKey);
  return DateTime.utc(ty, tm, td).difference(DateTime.utc(fy, fm, fd)).inDays;
}

/// D-day 라벨: 오늘 / 내일 / D-3 / 3일 전.
String dDayLabel(String targetKey, String todayKey) {
  final d = diffDays(todayKey, targetKey);
  if (d == 0) return '오늘';
  if (d == 1) return '내일';
  if (d > 0) return 'D-$d';
  return '${-d}일 전';
}

/// 이벤트에서 시작 시점을 꺼내는 함수.
///
/// 웹판은 구조적 타입(`T extends { start: string }`)으로 됐지만 Dart엔 그게 없다.
/// 인터페이스를 강제하면(`implements DayGroupable`) Supabase row(Map)나 아직 안 만든 모델을
/// 못 받는다. 그래서 추출 함수로 뒀다 — `package:collection`의 `groupBy`와 같은 관용구다.
typedef StartOf<T> = DateTime Function(T event);

/// 표시 tz 기준 날짜별 버킷팅. 각 버킷 안은 시작 시각 순.
///
/// 반환 Map의 **키 순서도 시간순**이다(전체를 먼저 정렬한 뒤 담으므로). 아젠다 뷰가
/// 별도 정렬 없이 `entries`를 그대로 쓸 수 있다 — 웹판 객체 키 순서는 보장이 없어
/// 호출부가 매번 다시 정렬했다.
Map<String, List<T>> groupByDay<T>(Iterable<T> events, StartOf<T> startOf) {
  final map = <String, List<T>>{};
  for (final (start, _, e) in _decorateSorted(events, startOf)) {
    (map[tz.dayKey(start)] ??= <T>[]).add(e);
  }
  return map;
}

/// [now] 이후 시작하는 일정만 시작 시각 순으로(다가오는 일정 — 오늘 카드용).
///
/// 경계는 웹판의 `>=`와 같게 **포함**이다(지금 막 시작한 일정은 아직 '다가오는'에 남는다).
List<T> upcomingEvents<T>(Iterable<T> events, DateTime now, StartOf<T> startOf) {
  return [
    for (final (start, _, e) in _decorateSorted(events, startOf))
      if (!start.isBefore(now)) e,
  ];
}

/// (시작시각, 원래 인덱스, 값)으로 장식해 **안정 정렬**한다.
///
/// 인덱스 tie-break가 핵심이다 — Dart `List.sort`는 stable이 아니라서(작은 리스트만
/// 삽입정렬로 우연히 안정적이다), 같은 시각 일정이 수십 개면 입력 순서가 뒤섞인다.
/// 그러면 Realtime 갱신마다 목록이 요동친다. 이 tie-break를 지우면 테스트 2개가 깨진다(확인함).
/// 장식을 먼저 만드는 이유는 [startOf]가 ISO 문자열 파싱일 수 있어서다(비교자 안에서
/// 부르면 O(n log n)번 파싱한다).
List<(DateTime, int, T)> _decorateSorted<T>(
  Iterable<T> events,
  StartOf<T> startOf,
) {
  final out = <(DateTime, int, T)>[];
  var i = 0;
  for (final e in events) {
    out.add((startOf(e), i++, e));
  }
  out.sort((a, b) {
    final c = a.$1.compareTo(b.$1);
    return c != 0 ? c : a.$2.compareTo(b.$2);
  });
  return out;
}

/// 'YYYY-MM-DD' → (year, month, day). month는 **1-based**(DateTime에 바로 넣는 값).
(int, int, int) _parseKey(String key) {
  final p = key.split('-');
  if (p.length != 3) {
    throw FormatException('날짜 키는 YYYY-MM-DD여야 한다', key);
  }
  return (int.parse(p[0]), int.parse(p[1]), int.parse(p[2]));
}
