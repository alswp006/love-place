/// 오프라인 큐의 Riverpod 통합 — 웹판 `OfflineQueueProvider.tsx`의 이식(D2).
///
/// 쓰기는 오프라인이면 enqueue로 적재 → 재연결 시 자동 flush(유실 0).
/// flush 성공/충돌 시 관련 provider 무효화(웹판 invalidateQueries와 동일).
/// 동시 flush 방지 가드 포함 — 같은 엔트리 2회 재생이 versionedUpdate 0행 →
/// 가짜 충돌 배너를 띄우는 것을 막는다(웹판 flushingRef).
library;

import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../core/env.dart';
import '../core/supabase.dart';
import '../sync/offline_executor.dart';
import '../sync/offline_queue.dart';
import '../sync/outbox_store.dart';
import 'places.dart';

/// durable store — 앱 문서 디렉터리의 JSON 파일. 테스트에서 override.
final outboxStoreProvider = Provider<OutboxStore>((ref) {
  // 파일 경로 확보 전 호출을 막기 위해 지연 초기화 래퍼를 쓴다.
  return _LazyFileStore();
});

class _LazyFileStore implements OutboxStore {
  Future<OutboxStore>? _inner;

  Future<OutboxStore> _resolve() => _inner ??= () async {
        final dir = await getApplicationDocumentsDirectory();
        // ⚠️ 파일명 고정(브랜드 변경과 무관) — 바꾸면 기존 기기의 미전송 큐가 고아가 된다.
        return FileOutboxStore(File('${dir.path}/love_place_outbox.json'));
      }();

  @override
  Future<List<OutboxEntry>> getAll() async => (await _resolve()).getAll();
  @override
  Future<void> add(OutboxEntry entry) async => (await _resolve()).add(entry);
  @override
  Future<void> remove(String id) async => (await _resolve()).remove(id);
  @override
  Future<void> clear() async => (await _resolve()).clear();
}

final offlineQueueProvider = Provider<OfflineQueue>(
  (ref) => OfflineQueue(ref.watch(outboxStoreProvider)),
);

/// 연결 상태 — connectivity_plus 스트림. none만 아니면 온라인으로 본다
/// (웹판 navigator.onLine과 같은 낙관 기준 — 실패는 flush의 throw가 잡는다).
final onlineProvider = StreamProvider<bool>((ref) async* {
  final connectivity = Connectivity();
  final first = await connectivity.checkConnectivity();
  yield !first.contains(ConnectivityResult.none);
  await for (final results in connectivity.onConnectivityChanged) {
    yield !results.contains(ConnectivityResult.none);
  }
});

class OfflineSyncState {
  const OfflineSyncState({this.pending = 0, this.conflicts = 0});
  final int pending;
  final int conflicts;
}

class OfflineSync extends Notifier<OfflineSyncState> {
  bool _flushing = false;

  @override
  OfflineSyncState build() {
    // 재연결 → 자동 flush(웹판 online 이벤트). 첫 값에서도 온라인이면 이전
    // 세션의 잔여 큐를 비운다(웹판 마운트 시 flush).
    ref.listen(onlineProvider, (prev, next) {
      if (next.value == true) unawaited(flush());
    }, fireImmediately: true);
    unawaited(_refreshPending());
    return const OfflineSyncState();
  }

  Future<void> _refreshPending() async {
    final n = await ref.read(offlineQueueProvider).pending();
    state = OfflineSyncState(pending: n, conflicts: state.conflicts);
  }

  /// 오프라인 적재. 호출부는 "연결되면 저장" 안내를 띄운다.
  Future<void> enqueue(
    String kind,
    Map<String, dynamic> payload, {
    String? dedupeKey,
  }) async {
    await ref
        .read(offlineQueueProvider)
        .enqueue(kind, payload, dedupeKey: dedupeKey);
    await _refreshPending();
    // 온라인이면 즉시 비운다(온라인 경로의 일시적 실패 후 enqueue된 경우 등).
    if (ref.read(onlineProvider).value == true) unawaited(flush());
  }

  Future<void> flush() async {
    if (_flushing || !Env.supabaseConfigured) return;
    _flushing = true;
    try {
      final res = await ref
          .read(offlineQueueProvider)
          .flush((entry) => executeOutbox(db, entry));
      if (res.done > 0 || res.conflicts.isNotEmpty) {
        // 무효화 대상은 Realtime과 같은 출처에서 온다(places.dart) — 둘이 갈라지면
        // "상대가 바꾸면 보이는데 내 오프라인 쓰기는 안 보인다" 같은 비대칭이 생긴다.
        invalidateSyncedData(ref);
      }
      state = OfflineSyncState(
        pending: res.remaining,
        conflicts: state.conflicts + res.conflicts.length,
      );
    } finally {
      _flushing = false;
    }
  }

  void clearConflicts() =>
      state = OfflineSyncState(pending: state.pending, conflicts: 0);
}

final offlineSyncProvider =
    NotifierProvider<OfflineSync, OfflineSyncState>(OfflineSync.new);
