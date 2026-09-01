/// trips 행 — 웹판 `useTrips`의 이식.
///
/// [TripLike]를 구현해 [tripDays]·[tripPhase]에 그대로 넣을 수 있다. 그 계약이 기간만
/// 요구하는 이유는, 날짜 계산이 행의 나머지 필드를 몰라도 되기 때문이다(테스트가 가벼워진다).
library;

import 'trip_days.dart';

class TripRow implements TripLike {
  const TripRow({
    required this.id,
    required this.title,
    required this.startDate,
    required this.endDate,
    required this.version,
    this.regionCode,
  });

  final String id;
  final String title;

  /// 'YYYY-MM-DD'. DB 타입이 `date`라 시각이 없다 — 그래서 문자열 비교가 곧 날짜 비교다.
  @override
  final String startDate;
  @override
  final String endDate;

  final int version;
  final String? regionCode;

  factory TripRow.fromJson(Map<String, dynamic> j) => TripRow(
        id: j['id'] as String,
        title: (j['title'] as String?) ?? '',
        startDate: j['start_date'] as String,
        endDate: j['end_date'] as String,
        version: (j['version'] as num?)?.toInt() ?? 1,
        regionCode: j['region_code'] as String?,
      );
}

const tripsSelect = 'id, title, start_date, end_date, region_code, version';
