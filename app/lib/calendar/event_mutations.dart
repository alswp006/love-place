/// 일정 쓰기 — 웹판 `useEventMutations`의 이식(생성·수정·삭제).
///
/// ## 규율
///
/// · **오프라인이면 큐에 적재**한다(§4.3). 이게 없으면 이동 중 적은 일정이 조용히 사라진다.
/// · **수정은 version 조건부**다. 0행 = 충돌이고, 무음 덮어쓰기(LWW)는 금지다.
/// · **패치에 없는 키는 보내지 않는다.** 특히 `place_id` — 폼에 장소 필드가 없으므로
///   생략함으로써 AI 코스가 심은 연결과 지도 연동을 보존한다. 전체 행을 통째로 update하는
///   방식으로 바꾸면 그 순간 장소 연결이 날아간다.
///
/// ## 웹판 버그를 따라 옮기지 않은 것
///
/// 웹판은 오프라인 재생(`offlineExecutor`)과 반복 분할에서 `category_id`를 **조용히 떨어뜨린다**.
/// 여기서는 두 경로 모두 넘긴다 — 충실 이식이 버그까지 옮기는 자리라 의도적으로 갈라섰다.
library;

import 'package:supabase_flutter/supabase_flutter.dart';

import '../sync/versioned_update.dart';
import 'event_row.dart';

/// 새 일정. 서버/트리거가 채우는 것(id·created_at·version)은 여기 없다.
class NewEvent {
  const NewEvent({
    required this.title,
    required this.start,
    required this.end,
    required this.isAllDay,
    required this.visibility,
    this.timeZone = 'Asia/Seoul',
    this.recurrenceRule,
    this.placeId,
    this.categoryId,
    this.reminders = const [],
  });

  final String title;
  final DateTime start;
  final DateTime end;
  final bool isAllDay;

  /// 'SHARED' | 'PERSONAL'.
  final String visibility;
  final String timeZone;
  final String? recurrenceRule;
  final String? placeId;
  final String? categoryId;
  final List<Reminder> reminders;

  /// insert 본문. `couple_id`·`owner_id`·감사 필드는 호출측이 채운다(그쪽만 아는 값이라).
  ///
  /// `participants: 'BOTH'`는 웹판이 모든 쓰기에서 박는 리터럴이다 — 컬럼은 있으나 어떤
  /// 도출도 이 값을 읽지 않는다. 상호운용을 위해 같은 값을 넣는다.
  Map<String, dynamic> toInsert({
    required String coupleId,
    required String myId,
  }) =>
      {
        'couple_id': coupleId,
        'title': title,
        'start': start.toUtc().toIso8601String(),
        'end': end.toUtc().toIso8601String(),
        'is_all_day': isAllDay,
        'time_zone': timeZone,
        'visibility': visibility,
        'participants': 'BOTH',
        'owner_id': myId,
        'place_id': placeId,
        'category_id': categoryId,
        'recurrence_rule': recurrenceRule,
        'reminders': reminders.map((r) => r.toJson()).toList(),
        'created_by': myId,
        'updated_by': myId,
      };

  /// 오프라인 큐에 실을 형태. 재생 시 [toInsert]와 같은 본문이 나와야 한다.
  Map<String, dynamic> toQueuePayload({
    required String coupleId,
    required String myId,
  }) =>
      {'row': toInsert(coupleId: coupleId, myId: myId)};

  /// 같은 일정을 두 번 눌러도 큐에 한 건만 남게 하는 키(웹판과 같은 조합).
  String dedupeKey() => 'event.create:${start.toUtc().toIso8601String()}:$title';
}

/// 수정 패치 — **넣은 키만** 서버로 간다.
///
/// null과 '생략'이 다르다: `categoryId: null`은 "카테고리를 지운다"이고, 키를 안 넣으면
/// "건드리지 않는다"다. Dart의 named optional로는 그 둘을 구분할 수 없어 Map을 직접 만든다.
class EventPatch {
  EventPatch();

  final Map<String, dynamic> _p = {};

  Map<String, dynamic> get map => Map.unmodifiable(_p);
  bool get isEmpty => _p.isEmpty;

  void title(String v) => _p['title'] = v;
  void times(DateTime start, DateTime end) {
    _p['start'] = start.toUtc().toIso8601String();
    _p['end'] = end.toUtc().toIso8601String();
  }

  void isAllDay(bool v) => _p['is_all_day'] = v;
  void visibility(String v) => _p['visibility'] = v;

  /// null이면 반복 해제.
  void recurrenceRule(String? v) => _p['recurrence_rule'] = v;

  /// null이면 카테고리 해제.
  void categoryId(String? v) => _p['category_id'] = v;

  void reminders(List<Reminder> v) =>
      _p['reminders'] = v.map((r) => r.toJson()).toList();
}

/// 일정 생성. 오프라인 판단은 호출측(provider)이 한다 — 여기는 네트워크 경로만 안다.
Future<void> insertEvent(
  SupabaseClient client,
  Map<String, dynamic> row,
) async {
  await client.from('events').insert(row);
}

/// 일정 수정 — version 조건부. 0행이면 [VersionedConflict].
///
/// 주의: 상대의 PERSONAL 일정을 고치려 하면 RLS가 막아 **0행**이 돌아온다. 버전 충돌과
/// 구분되지 않는다(웹판은 행을 재조회해 구분한다). 지금은 둘 다 '충돌'로 알리고,
/// 구분이 필요해지면 재조회를 붙인다 — 잘못 알리느니 보수적으로 같은 메시지를 낸다.
Future<VersionedResult<Map<String, dynamic>>> updateEvent(
  SupabaseClient client,
  String id,
  int expectedVersion,
  EventPatch patch,
  String myId,
) =>
    versionedUpdate(client, 'events', id, expectedVersion, {
      ...patch.map,
      'updated_by': myId,
    });

/// 휴지통으로(soft-delete). 물리 삭제는 하지 않는다(§4.3).
Future<VersionedResult<Map<String, dynamic>>> deleteEvent(
  SupabaseClient client,
  String id,
  int expectedVersion,
  String myId,
) =>
    softDelete(client, 'events', id, expectedVersion, myId);

/// 저장 시 **상대의 리마인더를 보존**한 채 내 것만 갈아끼운다.
///
/// 이게 이 파일에서 가장 조용히 틀리기 쉬운 자리다. reminders는 jsonb 배열 하나라 행을
/// 고칠 수 있으면 배열 전체를 덮어쓸 수 있고, DB·RLS 어느 것도 사용자별 분리를 강제하지
/// 않는다. 이 함수를 안 거치면 내가 일정을 고치는 순간 **상대의 리마인더가 사라진다**.
///
/// [myOffsetMinutes]가 null이면 내 리마인더를 없앤다(웹판은 0을 그렇게 다룬다).
List<Reminder> mergeMyReminder(
  List<Reminder> existing,
  String myId,
  int? myOffsetMinutes,
) {
  final others = existing.where((r) => r.userId != myId).toList();
  if (myOffsetMinutes == null || myOffsetMinutes == 0) return others;
  return [...others, Reminder(userId: myId, offsetMinutes: myOffsetMinutes)];
}
