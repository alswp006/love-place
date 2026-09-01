/// events 행 — 웹판 `useEvents.ts`의 EventRow 이식.
///
/// ## 스키마를 바꾸지 않는다는 전제에서 오는 함정 셋
///
/// ① **`end`는 SQL 예약어**라 DDL만 `"end"`고, PostgREST select 문자열과 JSON 키는 맨몸 `end`다.
///    Dart 필드는 `startAt`/`endAt`으로 두되 **JSON 키는 'start'/'end'를 그대로** 쓴다.
/// ② **`reminders`는 컬럼이 snake_case인데 내부 JSON은 camelCase**(`{userId, offsetMinutes}`).
///    웹판과 상호운용하려면 이 키를 바꾸면 안 된다.
/// ③ **`exdates` 컬럼은 없다.** 회차 예외는 `recurrence_rule` 문자열 안에
///    `EXDATE=YYYY-MM-DD,...`로 들어간다(iCal 비표준, 우리 자체 문법).
///
/// ## version은 앱이 올린다
///
/// 서버에 트리거가 없다(0003). `versioned_update`가 expected+1을 직접 보낸다 —
/// 즉 이 값을 읽어서 들고 있어야 낙관적 락이 성립한다.
library;

import 'rrule.dart';

/// 리마인더 한 건. 사용자별 분리는 **DB가 아니라 앱 규약**이다 —
/// 행을 고칠 수 있으면 배열 전체를 덮어쓸 수 있으므로, 저장 시 상대 항목을 반드시 보존해야 한다.
class Reminder {
  const Reminder({required this.userId, required this.offsetMinutes});

  final String userId;
  final int offsetMinutes;

  factory Reminder.fromJson(Map<String, dynamic> j) => Reminder(
        userId: j['userId'] as String,
        offsetMinutes: (j['offsetMinutes'] as num).toInt(),
      );

  Map<String, dynamic> toJson() =>
      {'userId': userId, 'offsetMinutes': offsetMinutes};
}

/// [RecurringEvent]를 구현해 [expandEvents]에 그대로 넣을 수 있다.
/// 게터 이름(start/end/recurrenceRule)은 그 계약이 요구하는 것이고, 저장 형식과는 무관하다.
class EventRow implements RecurringEvent {
  EventRow({
    required this.id,
    required this.title,
    required this.startAt,
    required this.endAt,
    required this.isAllDay,
    required this.timeZone,
    required this.visibility,
    required this.ownerId,
    required this.version,
    this.recurrenceRule,
    this.placeId,
    this.categoryId,
    this.reminders = const [],
  });

  final String id;
  final String title;

  /// JSON 키는 'start' — 컬럼명 그대로다.
  final DateTime startAt;

  /// JSON 키는 'end'. SQL 예약어라 DDL에서만 따옴표가 붙는다.
  final DateTime endAt;

  final bool isAllDay;

  /// 이벤트별 타임존(기본 'Asia/Seoul'). 지금은 저장·전달만 하고 표시에 반영하지 않는다
  /// — 표시는 tz.dart의 고정 오프셋을 쓴다(그 파일의 '갈아탈 때' 참조).
  final String timeZone;

  /// 'SHARED' | 'PERSONAL'. PERSONAL도 상대에게 **보인다** — 갈리는 건 색(트랙)과 쓰기 권한뿐이다.
  final String visibility;

  final String ownerId;
  final int version;

  /// 자체 미니 RRULE 문자열. null이면 비반복. EXDATE가 이 안에 산다.
  @override
  final String? recurrenceRule;

  final String? placeId;
  final String? categoryId;
  final List<Reminder> reminders;

  bool get isShared => visibility == 'SHARED';

  // ── RecurringEvent 계약 — 이름만 다르고 같은 값이다(계약은 start/end를 요구한다).
  @override
  DateTime get start => startAt;
  @override
  DateTime get end => endAt;

  factory EventRow.fromJson(Map<String, dynamic> j) => EventRow(
        id: j['id'] as String,
        title: (j['title'] as String?) ?? '',
        startAt: DateTime.parse(j['start'] as String).toUtc(),
        endAt: DateTime.parse(j['end'] as String).toUtc(),
        isAllDay: (j['is_all_day'] as bool?) ?? false,
        timeZone: (j['time_zone'] as String?) ?? 'Asia/Seoul',
        visibility: (j['visibility'] as String?) ?? 'SHARED',
        ownerId: (j['owner_id'] as String?) ?? '',
        version: (j['version'] as num?)?.toInt() ?? 1,
        recurrenceRule: j['recurrence_rule'] as String?,
        placeId: j['place_id'] as String?,
        categoryId: j['category_id'] as String?,
        reminders: ((j['reminders'] as List?) ?? const [])
            .whereType<Map>()
            .map((m) => Reminder.fromJson(m.cast<String, dynamic>()))
            .toList(growable: false),
      );

  /// 반복 전개가 만드는 '회차' — 원본 행에 그 회차의 시각만 갈아끼운 사본.
  EventRow occurrenceAt(DateTime start, DateTime end) => EventRow(
        id: id,
        title: title,
        startAt: start,
        endAt: end,
        isAllDay: isAllDay,
        timeZone: timeZone,
        visibility: visibility,
        ownerId: ownerId,
        version: version,
        recurrenceRule: recurrenceRule,
        placeId: placeId,
        categoryId: categoryId,
        reminders: reminders,
      );
}

/// PostgREST select 문자열 — 컬럼명 그대로(예약어 `end`도 따옴표 없이).
///
/// `itinerary_id`를 뺀 것은 웹판과 같다(AI 코스가 심지만 클라이언트가 읽지 않는다).
/// `memo`·`participants`도 뺐다 — 컬럼은 있으나 쓰는 UI가 없다.
const eventsSelect =
    'id, title, start, end, is_all_day, time_zone, recurrence_rule, '
    'visibility, owner_id, place_id, category_id, reminders, version';
