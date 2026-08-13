/// 커플 해석 — 웹판 `useCouple` + `useEnsureCouple`의 이식.
///
/// 정본은 `couples.user_a/user_b`(profiles.couple_id는 캐시 — CLAUDE.md §5-2).
/// 로그인했는데 ACTIVE 커플이 없으면 '혼자짜리 커플'을 만든다(0024
/// ensure_solo_couple) — current_couple_id()가 ACTIVE만 인정하므로, 커플 행이
/// 없으면 RLS가 전부 막아 앱이 죽은 화면이 된다.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/env.dart';
import '../core/supabase.dart';
import 'auth.dart';

class CoupleInfo {
  const CoupleInfo({
    this.coupleId,
    this.status,
    this.userA,
    this.userB,
    this.isSolo = false,
  });

  final String? coupleId;
  final String? status; // PENDING | ACTIVE | DISCONNECTED
  final String? userA;
  final String? userB;

  /// 혼자 쓰는 중(ACTIVE인데 상대가 없음, 0024). 연결 CTA·'상대' UI 숨김의 단일 기준.
  final bool isSolo;

  bool get isActive => status == 'ACTIVE';

  static const empty = CoupleInfo();
}

/// ensure_solo_couple을 사용자당 한 번만 시도(실패해도 재시도 없음 — 무한 루프
/// 방지, 웹판 triedFor ref와 동일). 프로세스 수명 캐시.
final _ensureTried = <String>{};

final coupleProvider = FutureProvider<CoupleInfo>((ref) async {
  final user = ref.watch(currentUserProvider);
  if (user == null || !Env.supabaseConfigured) return CoupleInfo.empty;

  Future<CoupleInfo> query() async {
    // PENDING도 봐야 "내 초대 대기중" UI를 그림 → DISCONNECTED만 제외.
    final rows = await db
        .from('couples')
        .select('id, status, user_a, user_b')
        .or('user_a.eq.${user.id},user_b.eq.${user.id}')
        .neq('status', 'DISCONNECTED');
    if (rows.isEmpty) return CoupleInfo.empty;
    // 여러 행이 나올 수 있다(옛 PENDING 초대를 남긴 채 상대 코드를 수락한 계정 등).
    // ACTIVE를 우선한다 — 웹판이 maybeSingle()로 앱 전체가 미연결로 보이던 버그의 고침.
    final data = rows.cast<Map<String, dynamic>>().firstWhere(
          (r) => r['status'] == 'ACTIVE',
          orElse: () => rows.first,
        );
    final userB = data['user_b'] as String?;
    return CoupleInfo(
      coupleId: data['id'] as String?,
      status: data['status'] as String?,
      userA: data['user_a'] as String?,
      userB: userB,
      isSolo: data['status'] == 'ACTIVE' && userB == null,
    );
  }

  var info = await query();
  if (!info.isActive && !_ensureTried.contains(user.id)) {
    // 마지막 방어선 — 트리거(handle_new_user)·0024 백필이 모두 빗나간 계정.
    // 실패하면 조용히 물러난다(호출부가 연결 화면으로 보낸다).
    _ensureTried.add(user.id);
    try {
      final res = await db.rpc<dynamic>('ensure_solo_couple');
      if (res is Map && res['ok'] == true) info = await query();
    } catch (_) {/* 조용히 — 연결 화면이 다음 단계 */}
  }
  return info;
});

/// 활성 커플 id — 데이터 쿼리의 공통 키(커플 격리의 단일 기준).
final coupleIdProvider = Provider<String?>((ref) {
  final couple = ref.watch(coupleProvider).value;
  return (couple != null && couple.isActive) ? couple.coupleId : null;
});
