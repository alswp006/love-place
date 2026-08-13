import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show SupabaseClient;
import 'package:weave/search/place_hit.dart';
import 'package:weave/sync/offline_executor.dart';
import 'package:weave/sync/offline_queue.dart';
import 'package:weave/sync/outbox_store.dart';

OfflineQueue _queue(OutboxStore store) {
  var t = 0;
  var i = 0;
  return OfflineQueue(store, now: () => ++t, genId: () => 'id-${++i}');
}

void main() {
  group('OfflineQueue — 유실 0 계약(§4.3, 웹판 offlineQueue.ts와 동일)', () {
    test('성공(ok)은 제거, done 집계', () async {
      final store = MemoryOutboxStore();
      final q = _queue(store);
      await q.enqueue('a', {});
      await q.enqueue('b', {});
      final res = await q.flush((e) async => FlushOutcome.ok);
      expect(res.done, 2);
      expect(res.remaining, 0);
      expect(res.stoppedEarly, isFalse);
    });

    test('충돌은 제거하되 보고한다 — 무음 덮어쓰기 금지', () async {
      final store = MemoryOutboxStore();
      final q = _queue(store);
      await q.enqueue('conflicting', {'x': 1});
      final res = await q.flush((e) async => FlushOutcome.conflict);
      expect(res.done, 0);
      expect(res.conflicts.single.kind, 'conflicting');
      expect(res.remaining, 0); // 제거는 됐다(재시도 무의미)
    });

    test('네트워크 오류(throw)는 중단 — 나머지는 잔류, 절대 버리지 않는다', () async {
      final store = MemoryOutboxStore();
      final q = _queue(store);
      await q.enqueue('first', {});
      await q.enqueue('second', {});
      await q.enqueue('third', {});
      var calls = 0;
      final res = await q.flush((e) async {
        calls++;
        if (calls == 2) throw Exception('network');
        return FlushOutcome.ok;
      });
      expect(res.done, 1); // first만 성공
      expect(res.stoppedEarly, isTrue);
      expect(res.remaining, 2); // second(실패분)·third(미시도) 둘 다 잔류
      final left = await store.getAll();
      expect(left.map((e) => e.kind), ['second', 'third']);
    });

    test('flush는 createdAt 오름차순 — 적재 순서대로 재생', () async {
      final store = MemoryOutboxStore();
      final q = _queue(store);
      await q.enqueue('one', {});
      await q.enqueue('two', {});
      await q.enqueue('three', {});
      final order = <String>[];
      await q.flush((e) async {
        order.add(e.kind);
        return FlushOutcome.ok;
      });
      expect(order, ['one', 'two', 'three']);
    });

    test('dedupeKey — 같은 키의 옛 의도를 대체하고 최신만 유지', () async {
      final store = MemoryOutboxStore();
      final q = _queue(store);
      await q.enqueue('wish.setPriority', {'p': 1}, dedupeKey: 'wish:w1');
      await q.enqueue('wish.setPriority', {'p': 3}, dedupeKey: 'wish:w1');
      await q.enqueue('wish.setPriority', {'p': 2}, dedupeKey: 'wish:w2');
      final all = await store.getAll();
      expect(all, hasLength(2));
      final w1 = all.firstWhere((e) => e.dedupeKey == 'wish:w1');
      expect(w1.payload['p'], 3); // 최신 의도만
    });
  });

  group('FileOutboxStore — 앱 재시작에도 살아남는다', () {
    test('add/getAll/remove 라운드트립(프로세스 재시작 시뮬레이션)', () async {
      final dir = await Directory.systemTemp.createTemp('outbox_test');
      addTearDown(() => dir.delete(recursive: true));
      final file = File('${dir.path}/outbox.json');

      final store1 = FileOutboxStore(file);
      await store1.add(const OutboxEntry(
          id: 'e1', kind: 'place.save', payload: {'a': 1}, createdAt: 10));
      await store1.add(const OutboxEntry(
          id: 'e2', kind: 'place.save', payload: {'b': 2}, createdAt: 20));

      // 새 인스턴스 = 앱 재시작. 파일에서 그대로 복원돼야 한다.
      final store2 = FileOutboxStore(file);
      final all = await store2.getAll();
      expect(all.map((e) => e.id), ['e1', 'e2']);
      expect(all.first.payload, {'a': 1});

      await store2.remove('e1');
      expect((await FileOutboxStore(file).getAll()).single.id, 'e2');
    });

    test('손상된 파일 → 빈 큐로 취급(앱이 죽지 않는다)', () async {
      final dir = await Directory.systemTemp.createTemp('outbox_test');
      addTearDown(() => dir.delete(recursive: true));
      final file = File('${dir.path}/outbox.json');
      await file.writeAsString('{broken json!!');
      expect(await FileOutboxStore(file).getAll(), isEmpty);
    });
  });

  group('offline executor', () {
    test('placeSavePayload ↔ PlaceHit 라운드트립 — 재생 시 정보 유실 없음', () {
      const hit = PlaceHit(
        kakaoPlaceId: 'k|a',
        name: '카페',
        address: '서울 마포구',
        lat: 37.5,
        lng: 127.0,
        category: '카페',
        phone: '02-000',
      );
      final payload =
          placeSavePayload(coupleId: 'c1', hit: hit, uid: 'u1');
      final restored =
          PlaceHit.fromJson((payload['hit'] as Map).cast<String, dynamic>());
      expect(restored.kakaoPlaceId, hit.kakaoPlaceId);
      expect(restored.name, hit.name);
      expect(restored.lat, hit.lat);
      expect(restored.phone, hit.phone);
      expect(payload['coupleId'], 'c1');
      expect(payload['uid'], 'u1');
    });

    test('미지 kind → ok(제거) — poison 엔트리가 큐를 차단하지 않는다(웹판 동일)', () async {
      final client = SupabaseClient('http://localhost', 'test-key');
      final outcome = await executeOutbox(
        client,
        const OutboxEntry(
            id: 'x', kind: 'future.op', payload: {}, createdAt: 1),
      );
      expect(outcome, FlushOutcome.ok);
    });
  });
}
