/// 낙관적 락(version 조건부 update) — 설계서 §4.3 [비협상].
///
/// 웹판 `src/lib/sync/versionedUpdate.ts`의 충실한 이식.
/// DB에 version 자동증가 트리거가 없으므로(0003: "버전은 앱이 명시 증가") 앱이
/// version+1을 직접 보낸다. **0행 반환 = 충돌**(서버 version이 더 높음) —
/// LWW 무음 덮어쓰기 금지, 사용자에게 표시한다.
library;

import 'package:supabase_flutter/supabase_flutter.dart';

class ConflictError implements Exception {
  const ConflictError([
    this.message = '상대가 먼저 수정했어요. 최신 내용으로 새로고침했어요.',
  ]);
  final String message;
  @override
  String toString() => 'ConflictError: $message';
}

/// 권한거부(상대 PERSONAL을 수정 시도) — 버전충돌과 메시지·처리를 분리.
class PermissionError implements Exception {
  const PermissionError([this.message = '이 일정은 상대만 수정할 수 있어요.']);
  final String message;
  @override
  String toString() => 'PermissionError: $message';
}

sealed class VersionedResult<T> {
  const VersionedResult();
}

class VersionedOk<T> extends VersionedResult<T> {
  const VersionedOk(this.row);
  final T row;
}

class VersionedConflict<T> extends VersionedResult<T> {
  const VersionedConflict();
}

/// update().select() 결과 행 해석: 0행 = 충돌(또는 행 소멸), 1행 = 성공. 순수 함수.
VersionedResult<T> interpretRows<T>(List<T> rows) =>
    rows.isEmpty ? VersionedConflict<T>() : VersionedOk<T>(rows.first);

/// version 조건부 update. [patch]에 version은 넣지 말 것(여기서 expected+1로 채운다).
///
/// `.eq('version', expected)`로 충돌 감지, `.isFilter('deleted_at', null)`로 살아있는 행만.
Future<VersionedResult<Map<String, dynamic>>> versionedUpdate(
  SupabaseClient client,
  String table,
  String id,
  int expectedVersion,
  Map<String, dynamic> patch,
) async {
  final rows = await client
      .from(table)
      .update({...patch, 'version': expectedVersion + 1})
      .eq('id', id)
      .eq('version', expectedVersion)
      .isFilter('deleted_at', null)
      .select();
  return interpretRows(rows);
}

/// 휴지통으로 보내기(soft-delete) — deleted_at만 채운다(물리삭제 금지 §4.3).
/// 살아있는 행만, version 조건부.
Future<VersionedResult<Map<String, dynamic>>> softDelete(
  SupabaseClient client,
  String table,
  String id,
  int expectedVersion,
  String updatedBy,
) =>
    versionedUpdate(client, table, id, expectedVersion, {
      'deleted_at': DateTime.now().toUtc().toIso8601String(),
      'updated_by': updatedBy,
    });
