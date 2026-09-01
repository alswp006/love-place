/// 표시 타임존 — 캘린더의 모든 날짜·시각 계산이 여기를 통과한다.
///
/// ## 왜 이 파일이 따로 있나
///
/// 웹판은 `Intl.DateTimeFormat({timeZone})`으로 임의 IANA 타임존을 다룬다. **Dart 코어에는
/// 대응물이 없다** — `DateTime`은 local과 UTC뿐이고, `package:intl`도 IANA 변환은 안 한다.
/// 그래서 이식하려면 둘 중 하나를 골라야 했다:
///
///   ① `package:timezone` 도입 — 임의 tz·DST까지 정확. 대신 ~1MB tz 데이터베이스와 초기화 필요.
///   ② 고정 오프셋 — 단순하고 의존성 0. 대신 그 tz 밖에서는 틀린다.
///
/// **②를 골랐다.** 서울은 1988년 이후 서머타임이 없어 `+09:00`이 연중 정확하고, 이 앱은 한국
/// 커플 둘이 쓴다. `events.time_zone`의 기본값도 'Asia/Seoul'이다.
///
/// ## 갈아탈 때
///
/// 해외에서 현지 시각으로 보고 싶어지면 **이 파일만** 바꾸면 된다. 계산 코드는 전부
/// [toDisplay]/[fromDisplay]를 통하므로, 여기서 `package:timezone` 조회로 바꾸면
/// 나머지는 그대로 동작한다. 그래서 오프셋을 상수로 흘리지 않고 함수로 감쌌다.
///
/// 지금 한계(알고 가는 것): 이벤트별 `time_zone` 컬럼은 저장·전달만 하고 표시에 반영하지
/// 않는다. 서울 밖에서 만든 일정도 서울 시각으로 보인다.
library;

/// 표시 기준 타임존 이름. 서버에 보내는 `events.time_zone`과 같은 값이어야 한다.
const displayTz = 'Asia/Seoul';

/// [displayTz]의 UTC 오프셋. DST가 없으므로 상수다(1988년 이후).
const _offset = Duration(hours: 9);

/// UTC(또는 임의 시각) → 표시 타임존의 **벽시계**.
///
/// 반환값의 `isUtc`는 false지만 기기의 로컬 타임존과는 무관하다 — 오직 '서울에서 몇 시로
/// 보이는가'를 담은 값이다. 그래서 이걸 다시 `toUtc()` 하면 안 된다([fromDisplay]를 쓸 것).
DateTime toDisplay(DateTime instant) =>
    DateTime.fromMicrosecondsSinceEpoch(
      instant.toUtc().microsecondsSinceEpoch + _offset.inMicroseconds,
      isUtc: true,
    );

/// 표시 타임존의 벽시계 → 실제 시점(UTC).
///
/// [toDisplay]의 역함수. 사용자가 고른 날짜·시각을 서버에 보낼 때 쓴다.
DateTime fromDisplay(DateTime wall) =>
    DateTime.fromMicrosecondsSinceEpoch(
      wall.microsecondsSinceEpoch - _offset.inMicroseconds,
      isUtc: true,
    );

/// 'YYYY-MM-DD' — 표시 타임존 기준 날짜 키.
///
/// 캘린더의 하루 경계를 정하는 값이다. UTC로 계산하면 한국 시각 오전 9시 이전 일정이
/// 전날로 밀린다.
String dayKey(DateTime instant) {
  final d = toDisplay(instant);
  return '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}

/// 'HH:mm' — 표시 타임존 기준 24시간 시각.
String formatTime(DateTime instant) {
  final d = toDisplay(instant);
  return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

/// 자정부터의 분 — 표시 타임존 기준. 같은 날 안에서 정렬·배치에 쓴다.
int minuteOfDay(DateTime instant) {
  final d = toDisplay(instant);
  return d.hour * 60 + d.minute;
}

/// 'YYYY-MM-DD' 날짜 키 → 그 날 자정(표시 타임존)의 실제 시점.
DateTime startOfDay(String key) {
  final p = key.split('-');
  return fromDisplay(DateTime.utc(
      int.parse(p[0]), int.parse(p[1]), int.parse(p[2])));
}
