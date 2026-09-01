/// 일정 쓰기의 앱 계층 — 오프라인 분기와 결과 해석을 한 곳에 모은다.
///
/// 순수 계산은 `calendar/event_mutations.dart`에, 네트워크·큐 판단은 여기에 둔다.
/// 화면은 [EventOutcome]만 보고 무엇을 말할지 정한다 — 무음 실패가 생기지 않게
/// 모든 경로가 결과를 돌려준다(§4.3).
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../calendar/event_mutations.dart';
import '../calendar/event_row.dart';
import '../core/supabase.dart';
import '../sync/versioned_update.dart';
import 'auth.dart';
import 'couple.dart';
import 'events.dart';
import 'offline.dart';

enum EventOutcome {
  /// 서버에 반영됐다.
  applied,

  /// 오프라인 — 큐에 담았고 재연결 시 반영된다(유실 0).
  queued,

  /// 상대가 먼저 고쳤거나(버전) 권한이 없다(상대의 PERSONAL). 무음 덮어쓰기 대신 알린다.
  conflict,

  /// 커플/세션이 아직 없다.
  notReady,
}

class EventActions {
  EventActions(this.ref);
  final Ref ref;

  bool get _online => ref.read(onlineProvider).value != false;

  Future<EventOutcome> create(NewEvent e) async {
    final coupleId = ref.read(coupleIdProvider);
    final myId = ref.read(currentUserProvider)?.id;
    if (coupleId == null || myId == null) return EventOutcome.notReady;

    if (!_online) {
      await ref.read(offlineSyncProvider.notifier).enqueue(
            'event.create',
            e.toQueuePayload(coupleId: coupleId, myId: myId),
            dedupeKey: e.dedupeKey(),
          );
      return EventOutcome.queued;
    }
    await insertEvent(db, e.toInsert(coupleId: coupleId, myId: myId));
    // 내 쓰기는 즉시 반영한다 — Realtime이 곧 밀어주지만 그 지연이 체감된다.
    ref.invalidate(eventsProvider);
    return EventOutcome.applied;
  }

  Future<EventOutcome> update(EventRow row, EventPatch patch) async {
    final myId = ref.read(currentUserProvider)?.id;
    if (myId == null) return EventOutcome.notReady;
    if (patch.isEmpty) return EventOutcome.applied; // 바뀐 게 없으면 서버를 부르지 않는다

    if (!_online) {
      await ref.read(offlineSyncProvider.notifier).enqueue(
            'event.update',
            {
              'id': row.id,
              'expectedVersion': row.version,
              'patch': patch.map,
              'myId': myId,
            },
            // 오프라인 중 같은 일정을 여러 번 고쳐도 **최신 의도 하나만** 남긴다.
            dedupeKey: 'event.update:${row.id}',
          );
      return EventOutcome.queued;
    }
    final r = await updateEvent(db, row.id, row.version, patch, myId);
    ref.invalidate(eventsProvider);
    return r is VersionedOk ? EventOutcome.applied : EventOutcome.conflict;
  }

  Future<EventOutcome> delete(EventRow row) async {
    final myId = ref.read(currentUserProvider)?.id;
    if (myId == null) return EventOutcome.notReady;

    if (!_online) {
      await ref.read(offlineSyncProvider.notifier).enqueue(
            'event.delete',
            {'id': row.id, 'expectedVersion': row.version, 'myId': myId},
            dedupeKey: 'event.delete:${row.id}',
          );
      return EventOutcome.queued;
    }
    final r = await deleteEvent(db, row.id, row.version, myId);
    ref.invalidate(eventsProvider);
    return r is VersionedOk ? EventOutcome.applied : EventOutcome.conflict;
  }
}

final eventActionsProvider = Provider<EventActions>(EventActions.new);

/// 결과 → 사용자에게 보일 문구. null이면 조용히 넘어간다(성공은 화면 변화로 충분).
String? outcomeMessage(EventOutcome o) => switch (o) {
      EventOutcome.applied => null,
      EventOutcome.queued => '오프라인이에요 — 연결되면 자동으로 저장할게요',
      EventOutcome.conflict =>
        '상대가 먼저 수정했거나 권한이 없어요. 최신 내용으로 새로고침했어요.',
      EventOutcome.notReady => '먼저 상대와 연결해 주세요.',
    };
