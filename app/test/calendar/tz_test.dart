import 'package:flutter_test/flutter_test.dart';
import 'package:weave/calendar/tz.dart';

/// 표시 타임존 — 캘린더의 하루 경계를 정하는 값이라 여기가 틀리면 전부 하루씩 밀린다.
///
/// 웹판은 `Intl.DateTimeFormat({timeZone:'Asia/Seoul'})`로 같은 일을 한다. Dart에는
/// 대응물이 없어 +09:00 고정으로 구현했다(서울은 1988년 이후 DST 없음).
/// 여기 케이스들은 **웹판과 같은 답이 나오는가**를 못박는다.
void main() {
  test('UTC 자정 → 서울은 같은 날 오전 9시', () {
    final utc = DateTime.utc(2026, 6, 2, 0, 0);
    expect(formatTime(utc), '09:00');
    expect(dayKey(utc), '2026-06-02');
  });

  test('★ UTC 15시 = 서울 다음날 자정 — 날짜 경계가 여기서 갈린다', () {
    // UTC로 계산하면 이 일정이 전날에 걸린다. 캘린더에서 가장 흔한 하루 밀림의 원인.
    final utc = DateTime.utc(2026, 6, 2, 15, 0);
    expect(dayKey(utc), '2026-06-03');
    expect(formatTime(utc), '00:00');
  });

  test('UTC 14:59는 아직 같은 날(경계 직전)', () {
    expect(dayKey(DateTime.utc(2026, 6, 2, 14, 59)), '2026-06-02');
  });

  test('minuteOfDay는 서울 자정 기준', () {
    expect(minuteOfDay(DateTime.utc(2026, 6, 2, 15, 0)), 0); // 서울 00:00
    expect(minuteOfDay(DateTime.utc(2026, 6, 2, 0, 30)), 9 * 60 + 30); // 서울 09:30
  });

  test('toDisplay ↔ fromDisplay 왕복이 손실 없다', () {
    final t = DateTime.utc(2026, 6, 2, 7, 23, 45);
    expect(fromDisplay(toDisplay(t)), t);
  });

  test('startOfDay는 그 날 서울 자정의 실제 시점', () {
    // 2026-06-02 서울 자정 = 2026-06-01 15:00 UTC
    expect(startOfDay('2026-06-02'), DateTime.utc(2026, 6, 1, 15, 0));
    // 왕복: 자정의 dayKey는 그 날이어야 한다(경계에서 하루 밀리지 않는다).
    expect(dayKey(startOfDay('2026-06-02')), '2026-06-02');
  });

  test('연말 경계 — 12/31 UTC 15시는 서울 새해', () {
    expect(dayKey(DateTime.utc(2026, 12, 31, 15, 0)), '2027-01-01');
  });

  test('한 자리 월·일도 0을 채운다(문자열 정렬·서버 비교에 쓰인다)', () {
    expect(dayKey(DateTime.utc(2026, 1, 4, 0, 0)), '2026-01-04');
  });

  test('DST가 없다 — 여름과 겨울의 오프셋이 같다', () {
    // 서울은 1988년 이후 서머타임이 없다. 이 단언이 깨지면 고정 오프셋 가정이 무너진 것이고,
    // 그때는 package:timezone으로 갈아타야 한다(이 파일만 바꾸면 된다).
    final summer = DateTime.utc(2026, 7, 15, 3, 0);
    final winter = DateTime.utc(2026, 1, 15, 3, 0);
    expect(formatTime(summer), formatTime(winter));
  });
}
