/// 오프라인 쓰기 아웃박스 저장소 — 웹판 `state/outboxStore.ts`의 이식.
///
/// 인터페이스 + 두 구현(파일=durable, 메모리=테스트). 큐 로직은 store에
/// 의존하지 않아 결정론 테스트가 가능하다.
library;

import 'dart:convert';
import 'dart:io';

class OutboxEntry {
  const OutboxEntry({
    required this.id,
    required this.kind,
    required this.payload,
    required this.createdAt,
    this.dedupeKey,
  });

  final String id;

  /// 'place.save' | 'wish.setPriority' | ... (executor 레지스트리와 1:1)
  final String kind;

  /// 직렬화 가능한 op 인자.
  final Map<String, dynamic> payload;

  /// 정렬용(주입 가능한 시계로 결정론 테스트) — epoch ms.
  final int createdAt;

  /// 있으면 같은 키의 기존 엔트리를 대체(동일행 재편집 유실 방지 — '유실 0').
  final String? dedupeKey;

  Map<String, dynamic> toJson() => {
        'id': id,
        'kind': kind,
        'payload': payload,
        'createdAt': createdAt,
        if (dedupeKey != null) 'dedupeKey': dedupeKey,
      };

  static OutboxEntry fromJson(Map<String, dynamic> j) => OutboxEntry(
        id: j['id'] as String,
        kind: j['kind'] as String,
        payload: (j['payload'] as Map).cast<String, dynamic>(),
        createdAt: j['createdAt'] as int,
        dedupeKey: j['dedupeKey'] as String?,
      );
}

abstract interface class OutboxStore {
  Future<List<OutboxEntry>> getAll();
  Future<void> add(OutboxEntry entry);
  Future<void> remove(String id);
  Future<void> clear();
}

/// 메모리 store — 테스트 폴백.
class MemoryOutboxStore implements OutboxStore {
  final _items = <OutboxEntry>[];

  @override
  Future<List<OutboxEntry>> getAll() async => List.of(_items);

  @override
  Future<void> add(OutboxEntry entry) async => _items.add(entry);

  @override
  Future<void> remove(String id) async =>
      _items.removeWhere((e) => e.id == id);

  @override
  Future<void> clear() async => _items.clear();
}

/// 파일 store — 앱 종료/재시작에도 살아남는 durable 아웃박스(웹판 IndexedDB 대응).
///
/// ⚠️ 파일명은 브랜드가 바뀌어도 'love_place_outbox.json' 그대로다 — 바꾸는 순간
/// 기존 기기의 미전송 큐가 고아가 된다(유실 0이 P1 계약, §4.3). 웹판이 IndexedDB
/// dbName을 'love_place'로 못박은 것과 같은 이유.
///
/// 쓰기는 임시 파일 → rename(원자적) — 도중 크래시로 반쪽 JSON이 남지 않게.
class FileOutboxStore implements OutboxStore {
  FileOutboxStore(this._file);

  final File _file;

  Future<List<OutboxEntry>> _read() async {
    try {
      if (!await _file.exists()) return const [];
      final text = await _file.readAsString();
      if (text.trim().isEmpty) return const [];
      final list = jsonDecode(text);
      if (list is! List) return const [];
      return list
          .whereType<Map>()
          .map((m) => OutboxEntry.fromJson(m.cast<String, dynamic>()))
          .toList();
    } catch (_) {
      // 손상된 파일 — 읽을 수 있는 게 없다. 큐를 비운 것으로 취급하되 파일은
      // 남긴다(다음 쓰기가 덮는다). 여기서 throw하면 앱 전체가 죽는다.
      return const [];
    }
  }

  Future<void> _write(List<OutboxEntry> items) async {
    final tmp = File('${_file.path}.tmp');
    await tmp.writeAsString(
      jsonEncode(items.map((e) => e.toJson()).toList()),
      flush: true,
    );
    await tmp.rename(_file.path);
  }

  @override
  Future<List<OutboxEntry>> getAll() => _read();

  @override
  Future<void> add(OutboxEntry entry) async =>
      _write([...await _read(), entry]);

  @override
  Future<void> remove(String id) async =>
      _write((await _read()).where((e) => e.id != id).toList());

  @override
  Future<void> clear() async => _write(const []);
}
