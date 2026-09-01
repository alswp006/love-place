/// 여행 Day 도출 — 웹판 `tripDays.ts`의 이식.
///
/// ## 핵심 계약: 계획을 따로 저장하지 않는다
///
/// 여행의 Day N 스톱 = **그 날짜에 든 `events` 중 `place_id`가 있는 것**이다.
/// `events.trip_id` 컬럼도, 조인 테이블도 없다(CLAUDE.md §7 "상태는 도출, 저장 아님").
///
/// 그래서 캘린더(시간 축)와 여행(여행 축)이 **같은 events를 다른 렌즈로 볼 뿐**이고,
/// 둘 사이에 불일치가 생길 수 없다. 여행에 스톱을 담는 것과 캘린더에 일정을 넣는 것이
/// 같은 행위이므로 "캘린더엔 있는데 여행엔 없다" 같은 상태가 구조적으로 불가능하다.
///
/// 이걸 깨고 trip_id를 추가하면 이중 관리가 시작된다 — 이식하면서 가장 지켜야 할 결정이다.
library;

import '../calendar/event_days.dart';
import '../calendar/event_row.dart';

/// 기간만 있으면 Day를 뽑을 수 있다 — trips 행 전체가 필요하지 않다.
abstract interface class TripLike {
  String get startDate; // 'YYYY-MM-DD'
  String get endDate;
}

/// 여행 기간 안의 하루 슬롯. [index]는 1-based(화면의 "Day 1").
class TripDay {
  const TripDay({required this.key, required this.index});
  final String key;
  final int index;
}

/// 날짜 키에 일수 가감. UTC 산술이라 로컬 tz·DST에 흔들리지 않는다.
String addDays(String key, int delta) {
  final p = key.split('-').map(int.parse).toList();
  final t = DateTime.utc(p[0], p[1], p[2] + delta);
  return ymdKey(t.year, t.month - 1, t.day); // month0는 0-based
}

/// 기간 → Day 슬롯.
///
/// `end < start`(잘못된 행)면 빈 배열. [maxDays]는 폭주 방어 상한 — 넘으면 잘라낸다.
/// DB에 CHECK가 있지만 클라이언트가 그것만 믿고 무한 루프를 돌면 안 된다.
List<TripDay> tripDays(TripLike trip, {int maxDays = 60}) {
  final span = diffDays(trip.startDate, trip.endDate);
  if (span < 0) return const [];
  final count = span + 1 > maxDays ? maxDays : span + 1;
  return [
    for (var i = 0; i < count; i++)
      TripDay(key: addDays(trip.startDate, i), index: i + 1),
  ];
}

/// 오늘 기준 여행의 국면.
///
/// 색이 아니라 **여기서 나온 텍스트 라벨**로 구분한다(§8 이중화).
enum TripPhase { ongoing, upcoming, past }

TripPhase tripPhase(TripLike trip, String todayKey) {
  if (todayKey.compareTo(trip.startDate) < 0) return TripPhase.upcoming;
  if (todayKey.compareTo(trip.endDate) > 0) return TripPhase.past;
  return TripPhase.ongoing;
}

/// 목록 칩 라벨. 진행중은 'D-'가 의미 없으므로 '여행 중'.
String tripPhaseLabel(TripLike trip, String todayKey) {
  switch (tripPhase(trip, todayKey)) {
    case TripPhase.ongoing:
      return '여행 중';
    case TripPhase.upcoming:
      final d = diffDays(todayKey, trip.startDate);
      return d == 1 ? '내일 출발' : 'D-$d';
    case TripPhase.past:
      final d = diffDays(trip.endDate, todayKey);
      return d == 1 ? '어제' : '$d일 전';
  }
}

const _phaseOrder = {
  TripPhase.ongoing: 0,
  TripPhase.upcoming: 1,
  TripPhase.past: 2,
};

/// 목록 정렬: 진행중 → 예정(임박한 순) → 지난(최근 순).
///
/// 지금 무엇을 하고 있는지가 맨 위에 온다. 원본 배열은 건드리지 않는다 —
/// provider가 캐시한 배열을 그대로 넘겨도 안전해야 한다.
List<T> sortTripsForList<T extends TripLike>(List<T> trips, String todayKey) {
  final out = [...trips];
  out.sort((a, b) {
    final pa = tripPhase(a, todayKey);
    final pb = tripPhase(b, todayKey);
    if (pa != pb) return _phaseOrder[pa]!.compareTo(_phaseOrder[pb]!);
    // 예정은 가까운 것부터, 진행중·지난은 최근 것부터.
    return pa == TripPhase.upcoming
        ? a.startDate.compareTo(b.startDate)
        : b.startDate.compareTo(a.startDate);
  });
  return out;
}

/// 그 날의 스톱 = 그 날짜 버킷의 이벤트 중 **place_id가 있는 것**, 시작시각 순.
///
/// 장소 없는 일정(예: "휴가 신청")은 캘린더엔 남되 여행 동선에는 끼지 않는다.
List<EventRow> stopsOfDay(List<EventRow> events, String day) {
  final out = events
      .where((e) => e.placeId != null && dayKey(e.startAt) == day)
      .toList();
  out.sort((a, b) => a.startAt.compareTo(b.startAt));
  return out;
}

/// 그 날의 메모 = 장소가 붙지 않은 일정.
///
/// 스톱과 나눠 보여주는 이유: 동선에 끼지 않는 일정을 스톱 목록에 섞으면 "여기도 가는
/// 곳인가?" 하고 읽힌다. 같은 날의 일이지만 성격이 다르다.
List<EventRow> notesOfDay(List<EventRow> events, String day) {
  final out = events
      .where((e) => e.placeId == null && dayKey(e.startAt) == day)
      .toList();
  out.sort((a, b) => a.startAt.compareTo(b.startAt));
  return out;
}
