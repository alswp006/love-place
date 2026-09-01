/// 반복 3-범위 편집의 쓰기 계층.
///
/// ## 왜 이 파일이 조심스러운가 — 2단계 쓰기
///
/// `thisOne`(수정)과 `following`은 **update + insert 두 번**을 쓴다. 그 사이에 실패하면
/// 어중간한 상태가 남는다. 웹판도 같은 구조이고, 부분 실패를 다루지 않는다.
///
/// 트랜잭션으로 묶는 게 정답이지만 그건 서버 함수(RPC)가 필요하고, 스키마를 안 바꾸기로 한
/// 이번 이식의 범위 밖이다. 그래서 **순서로 피해를 줄인다**:
///
///   1. 먼저 새 행을 만든다(insert)
///   2. 성공하면 기존 시리즈를 고친다(update)
///
/// 웹판은 반대 순서다(update 먼저). 그 순서에서 2단계가 실패하면 **회차가 사라진다** —
/// 시리즈에서는 도려내졌는데 대체 행이 없다. 우리 순서에서 실패하면 **회차가 둘 보인다** —
/// 원본 시리즈와 새 행이 겹친다. 눈에 보이는 중복이 조용한 실종보다 낫다. 사용자가 알아채고
/// 지울 수 있기 때문이다.
///
/// 실패는 반드시 알린다([RecurrenceOutcome.partial]).
///
/// ## 오프라인
///
/// 2단계 쓰기는 큐에 넣지 않는다. 큐는 항목별로 독립 재생이라 순서를 보장하지 못하고,
/// 그 사이 다른 기기가 시리즈를 고치면 결과가 예측 불가능해진다. 오프라인에서는 거절하고
/// 이유를 말한다 — 조용히 이상해지는 것보다 낫다.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../calendar/event_mutations.dart';
import '../calendar/event_row.dart';
import '../calendar/recurrence_scope.dart';
import '../calendar/tz.dart';
import '../core/supabase.dart';
import '../sync/versioned_update.dart';
import 'auth.dart';
import 'couple.dart';
import 'events.dart';
import 'offline.dart';

enum RecurrenceOutcome {
  applied,
  conflict,

  /// 2단계 중 뒤가 실패 — 새 행은 만들어졌는데 시리즈 정리가 안 됐다(회차가 겹쳐 보인다).
  partial,

  /// 오프라인 — 2단계 쓰기는 큐에 넣지 않는다.
  offlineUnsupported,
  notReady,
}

/// 편집 내용 — 어느 범위든 같은 형태로 받는다.
class RecurrenceEdit {
  const RecurrenceEdit({
    required this.title,
    required this.start,
    required this.end,
    required this.isAllDay,
    required this.visibility,
  });

  final String title;

  /// 폼이 들고 있는 시각(시리즈 앵커 기준). 회차로 옮기는 건 [shiftTimesToOccurrence]가 한다.
  final DateTime start;
  final DateTime end;
  final bool isAllDay;
  final String visibility;
}

class RecurrenceActions {
  RecurrenceActions(this.ref);
  final Ref ref;

  bool get _online => ref.read(onlineProvider).value != false;

  /// [series]의 [occDayKey] 회차를 [scope] 범위로 고친다.
  ///
  /// [occStart]는 그 회차의 실제 시작 시각(전개 결과). 시리즈 앵커가 아니다.
  Future<RecurrenceOutcome> edit({
    required EventRow series,
    required String occDayKey,
    required DateTime occStart,
    required RecurrenceScope scope,
    required RecurrenceEdit edit,
  }) async {
    final coupleId = ref.read(coupleIdProvider);
    final myId = ref.read(currentUserProvider)?.id;
    if (coupleId == null || myId == null) return RecurrenceOutcome.notReady;

    final rule = series.recurrenceRule;
    if (rule == null) return RecurrenceOutcome.notReady;

    // 'all'만 단일 쓰기라 오프라인에서도 안전하다. 나머지는 거절한다(위 주석 참조).
    if (scope != RecurrenceScope.all && !_online) {
      return RecurrenceOutcome.offlineUnsupported;
    }

    switch (scope) {
      case RecurrenceScope.all:
        final patch = EventPatch()
          ..title(edit.title)
          ..times(edit.start, edit.end)
          ..isAllDay(edit.isAllDay)
          ..visibility(edit.visibility);
        final r = await updateEvent(db, series.id, series.version, patch, myId);
        ref.invalidate(eventsProvider);
        return r is VersionedOk
            ? RecurrenceOutcome.applied
            : RecurrenceOutcome.conflict;

      case RecurrenceScope.thisOne:
        // 폼 시각을 그 회차 날짜로 옮긴다 — 안 하면 override가 앵커 날짜에 떨어진다.
        final t = shiftTimesToOccurrence(edit.start, edit.end, occDayKey);
        // ① 대체할 비반복 행을 먼저 만든다(실패해도 시리즈는 그대로).
        await insertEvent(
          db,
          NewEvent(
            title: edit.title,
            start: t.start,
            end: t.end,
            isAllDay: edit.isAllDay,
            visibility: edit.visibility,
            // 카테고리·장소를 넘긴다 — 웹판은 이 경로에서 category_id를 흘린다.
            categoryId: series.categoryId,
            placeId: series.placeId,
            reminders: series.reminders,
          ).toInsert(coupleId: coupleId, myId: myId),
        );
        // ② 시리즈에서 그 날짜를 도려낸다.
        final r = await updateEvent(
          db,
          series.id,
          series.version,
          EventPatch()..recurrenceRule(exdateOccurrence(rule, occDayKey)),
          myId,
        );
        ref.invalidate(eventsProvider);
        return r is VersionedOk
            ? RecurrenceOutcome.applied
            : RecurrenceOutcome.partial;

      case RecurrenceScope.following:
        final split = splitFollowing(rule, occStart);
        final t = shiftTimesToOccurrence(
            edit.start, edit.end, split.newSeriesStartKey);
        // ① 분할일부터의 새 시리즈를 먼저 만든다. 규칙은 원본을 물려받되 절단 정보는 없다.
        await insertEvent(
          db,
          NewEvent(
            title: edit.title,
            start: t.start,
            end: t.end,
            isAllDay: edit.isAllDay,
            visibility: edit.visibility,
            recurrenceRule: rule,
            categoryId: series.categoryId,
            placeId: series.placeId,
            reminders: series.reminders,
          ).toInsert(coupleId: coupleId, myId: myId),
        );
        // ② 기존 시리즈를 분할 직전까지로 자른다.
        final r = await updateEvent(
          db,
          series.id,
          series.version,
          EventPatch()..recurrenceRule(split.truncatedRule),
          myId,
        );
        ref.invalidate(eventsProvider);
        return r is VersionedOk
            ? RecurrenceOutcome.applied
            : RecurrenceOutcome.partial;
    }
  }

  /// 회차 삭제. `thisOne`은 EXDATE만 더하면 되므로 **단일 쓰기**다(대체 행이 없다).
  Future<RecurrenceOutcome> delete({
    required EventRow series,
    required String occDayKey,
    required DateTime occStart,
    required RecurrenceScope scope,
  }) async {
    final myId = ref.read(currentUserProvider)?.id;
    if (myId == null) return RecurrenceOutcome.notReady;
    final rule = series.recurrenceRule;
    if (rule == null) return RecurrenceOutcome.notReady;
    if (scope != RecurrenceScope.all && !_online) {
      return RecurrenceOutcome.offlineUnsupported;
    }

    final VersionedResult<Map<String, dynamic>> r;
    switch (scope) {
      case RecurrenceScope.all:
        r = await deleteEvent(db, series.id, series.version, myId);
      case RecurrenceScope.thisOne:
        r = await updateEvent(
          db,
          series.id,
          series.version,
          EventPatch()..recurrenceRule(exdateOccurrence(rule, occDayKey)),
          myId,
        );
      case RecurrenceScope.following:
        // 이후를 지우는 건 '분할 직전까지로 자르기'다 — 새 시리즈를 만들지 않는다(단일 쓰기).
        r = await updateEvent(
          db,
          series.id,
          series.version,
          EventPatch()
            ..recurrenceRule(splitFollowing(rule, occStart).truncatedRule),
          myId,
        );
    }
    ref.invalidate(eventsProvider);
    return r is VersionedOk
        ? RecurrenceOutcome.applied
        : RecurrenceOutcome.conflict;
  }
}

final recurrenceActionsProvider =
    Provider<RecurrenceActions>(RecurrenceActions.new);

String? recurrenceMessage(RecurrenceOutcome o) => switch (o) {
      RecurrenceOutcome.applied => null,
      RecurrenceOutcome.conflict =>
        '상대가 먼저 수정했거나 권한이 없어요. 최신 내용으로 새로고침했어요.',
      // 사용자가 알아채고 손볼 수 있게 무엇이 남았는지 그대로 말한다.
      RecurrenceOutcome.partial =>
        '새 일정은 만들었는데 원래 반복을 정리하지 못했어요. 같은 날에 일정이 두 번 보이면 하나를 지워주세요.',
      RecurrenceOutcome.offlineUnsupported =>
        '반복 일정 편집은 연결됐을 때만 할 수 있어요.',
      RecurrenceOutcome.notReady => '먼저 상대와 연결해 주세요.',
    };

/// 날짜 키에서 그 회차의 시작 시각을 만든다(아젠다가 회차 시각을 들고 있지 않을 때).
DateTime occurrenceStartFrom(EventRow occurrence) => occurrence.startAt;

/// 표시용 — 그 회차가 시리즈의 몇 번째인지는 알 필요 없고, 날짜만 보여주면 된다.
String occurrenceLabel(DateTime occStart) => dayKey(occStart);
