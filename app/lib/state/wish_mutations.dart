/// 위시 우선순위(하트) mutation — 웹판 `useSetWishPriority`의 이식.
///
/// 낙관적 락(version 조건부, §4.3): 충돌이면 conflict를 돌려 호출부가 표시하고,
/// 성공이든 충돌이든 서버 정본으로 다시 맞춘다(LWW 금지 — 내 값이 덮어쓰지 않음).
/// 오프라인이면 큐 적재(dedupeKey=`wish.setPriority:<id>` — 재편집 시 최신 의도만).
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/supabase.dart';
import '../sync/versioned_update.dart';
import 'offline.dart';
import 'places.dart';

enum SetPriorityOutcome { applied, conflict, queued }

class WishMutations extends Notifier<void> {
  @override
  void build() {}

  Future<SetPriorityOutcome> setPriority({
    required String wishId,
    required int expectedVersion,
    required int priority,
    required String myId,
  }) async {
    if (ref.read(onlineProvider).value == false) {
      await ref.read(offlineSyncProvider.notifier).enqueue(
        'wish.setPriority',
        {
          'wishId': wishId,
          'expectedVersion': expectedVersion,
          'priority': priority,
          'myId': myId,
        },
        dedupeKey: 'wish.setPriority:$wishId',
      );
      return SetPriorityOutcome.queued;
    }
    final r = await versionedUpdate(
      db,
      'wishes',
      wishId,
      expectedVersion,
      {'priority': priority, 'updated_by': myId},
    );
    // 성공/충돌 모두 서버 정본으로 재동기화.
    ref.invalidate(wishesProvider);
    return r is VersionedOk
        ? SetPriorityOutcome.applied
        : SetPriorityOutcome.conflict;
  }
}

final wishMutationsProvider =
    NotifierProvider<WishMutations, void>(WishMutations.new);
