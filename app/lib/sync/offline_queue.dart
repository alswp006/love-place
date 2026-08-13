/// 오프라인 쓰기 큐 매니저 — 웹판 `state/offlineQueue.ts`의 충실한 이식(D2).
///
/// 유실 0 보장:
/// - 성공(ok): 큐에서 제거.
/// - 충돌(conflict): 제거 + 보고(무음 덮어쓰기 아님 — 사용자에게 표시).
/// - 네트워크 오류(executor throw): **중단**하고 나머지는 큐에 남겨 재연결 시 재시도.
library;

import 'outbox_store.dart';

enum FlushOutcome { ok, conflict }

typedef OutboxExecutor = Future<FlushOutcome> Function(OutboxEntry entry);

class FlushResult {
  const FlushResult({
    required this.done,
    required this.conflicts,
    required this.remaining,
    required this.stoppedEarly,
  });

  final int done;
  final List<OutboxEntry> conflicts;
  final int remaining;

  /// 네트워크 오류로 중단됨(아직 오프라인).
  final bool stoppedEarly;
}

class OfflineQueue {
  OfflineQueue(
    this._store, {
    int Function()? now,
    String Function()? genId,
  })  : _now = now ?? (() => DateTime.now().millisecondsSinceEpoch),
        _genId = genId ?? _uuidLike;

  final OutboxStore _store;
  final int Function() _now;
  final String Function() _genId;

  static int _seq = 0;
  static String _uuidLike() =>
      '${DateTime.now().microsecondsSinceEpoch}-${_seq++}';

  /// 같은 [dedupeKey]의 기존 엔트리를 제거하고 최신 의도만 유지.
  /// 오프라인 중엔 서버 version이 안 바뀌므로, 마지막 값 + 동일 expectedVersion으로
  /// 한 번에 적용된다(유실 0).
  Future<OutboxEntry> enqueue(
    String kind,
    Map<String, dynamic> payload, {
    String? dedupeKey,
  }) async {
    if (dedupeKey != null) {
      for (final e in await _store.getAll()) {
        if (e.dedupeKey == dedupeKey) await _store.remove(e.id);
      }
    }
    final entry = OutboxEntry(
      id: _genId(),
      kind: kind,
      payload: payload,
      createdAt: _now(),
      dedupeKey: dedupeKey,
    );
    await _store.add(entry);
    return entry;
  }

  Future<int> pending() async => (await _store.getAll()).length;

  /// 큐를 createdAt 오름차순으로 재생. 유실 0(파일 머리 규칙).
  Future<FlushResult> flush(OutboxExecutor executor) async {
    final entries = (await _store.getAll())
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    var done = 0;
    final conflicts = <OutboxEntry>[];
    var stoppedEarly = false;

    for (final entry in entries) {
      FlushOutcome outcome;
      try {
        outcome = await executor(entry);
      } catch (_) {
        stoppedEarly = true; // 아직 네트워크 불가 → 나머지 잔류(재시도). 절대 버리지 않음.
        break;
      }
      await _store.remove(entry.id);
      if (outcome == FlushOutcome.ok) {
        done++;
      } else {
        conflicts.add(entry); // 충돌도 제거하되 보고 → 무음 덮어쓰기 방지
      }
    }

    final remaining = (await _store.getAll()).length;
    return FlushResult(
      done: done,
      conflicts: conflicts,
      remaining: remaining,
      stoppedEarly: stoppedEarly,
    );
  }
}
