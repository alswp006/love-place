/// 커플 연결·해제 — 웹판 `useCoupleInvite`의 이식.
///
/// 전부 서버 RPC다. 초대 코드 발급·검증·연결은 **원자적으로** 일어나야 하기 때문이다
/// (CLAUDE.md §4.2): 두 사람이 동시에 같은 코드를 넣거나, 코드를 받은 쪽이 그 사이 다른
/// 사람과 연결되는 경합이 실재한다. 클라이언트에서 조회 후 쓰기로 나누면 그 창이 열린다.
///
/// 그래서 이 파일은 판정을 하지 않는다 — 서버 응답의 `reason`을 그대로 문구로 옮길 뿐이다.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/supabase.dart';
import '../couple/invite_code.dart';
import 'couple.dart';
import 'events.dart';
import 'places.dart';

/// RPC 결과의 공통 모양. `ok`가 false면 [reason]이 왜인지 말한다.
class CoupleRpcResult {
  const CoupleRpcResult({required this.ok, this.reason, this.code, this.expiresAt});

  final bool ok;
  final String? reason;

  /// create_invite 성공 시의 8자 코드.
  final String? code;
  final DateTime? expiresAt;

  /// 실패 사유를 사람이 읽을 문장으로. 성공이면 null.
  String? get message => ok ? null : inviteReasonMessage(reason ?? '');

  factory CoupleRpcResult.fromJson(Map<String, dynamic> j) => CoupleRpcResult(
        ok: j['ok'] == true,
        reason: j['reason'] as String?,
        code: j['code'] as String?,
        expiresAt: j['expires_at'] != null
            ? DateTime.tryParse(j['expires_at'] as String)
            : null,
      );
}

class CoupleActions {
  CoupleActions(this.ref);
  final Ref ref;

  static Map<String, dynamic> _asMap(dynamic v) =>
      v is Map ? v.cast<String, dynamic>() : const {'ok': false};

  /// 내 초대 코드를 발급한다(48시간, 1회용).
  Future<CoupleRpcResult> createInvite() async {
    final res = await db.rpc('create_invite');
    return CoupleRpcResult.fromJson(_asMap(res));
  }

  /// 상대의 코드를 넣어 연결한다.
  Future<CoupleRpcResult> acceptInvite(String rawCode) async {
    final res = await db.rpc('accept_invite',
        params: {'p_code': normalizeInviteCode(rawCode)});
    final r = CoupleRpcResult.fromJson(_asMap(res));
    // 커플이 바뀌면 보이는 데이터가 통째로 달라진다 — 캐시를 남기면 이전 공간의 잔상이 뜬다.
    if (r.ok) _invalidateCoupleScopedData();
    return r;
  }

  /// 연결 해제. 양쪽 모두 각자 '혼자짜리 커플'을 새로 받는다(0024).
  Future<CoupleRpcResult> disconnect(String coupleId) async {
    final res =
        await db.rpc('disconnect_couple', params: {'p_couple_id': coupleId});
    final r = CoupleRpcResult.fromJson(_asMap(res));
    if (r.ok) _invalidateCoupleScopedData();
    return r;
  }

  /// 커플 범위 데이터를 전부 버린다.
  ///
  /// 웹판은 `queryClient.clear()`로 캐시를 통째로 비운다(web-stack §4.2 — 타 couple 데이터
  /// 잔존 금지). Riverpod엔 그 한 방이 없어 명시적으로 무효화한다. 빠뜨리면 연결 직후
  /// **이전 공간의 장소·일정이 남아 보인다**.
  void _invalidateCoupleScopedData() {
    ref.invalidate(coupleProvider);
    ref.invalidate(placesProvider);
    ref.invalidate(wishesProvider);
    ref.invalidate(visitedIdsProvider);
    ref.invalidate(eventsProvider);
  }
}

final coupleActionsProvider = Provider<CoupleActions>(CoupleActions.new);
