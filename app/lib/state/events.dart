/// events 데이터 계층 — 웹판 `useEvents`의 이식.
///
/// places 계층과 같은 규율(web-stack.md §4.3·§4.4):
/// 쿼리는 coupleId 기준(RLS가 서버측 방어선), Realtime은 페이로드 머지가 아니라 **무효화**로
/// 일원화, 채널은 provider 생명주기에 묶는다.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../calendar/event_row.dart';
import '../core/env.dart';
import '../core/supabase.dart';
import 'couple.dart';

/// 커플의 살아있는 일정 전부.
///
/// 왜 기간으로 안 자르나: 반복 일정은 규칙 하나가 몇 년치 회차를 만든다. 서버에서 기간으로
/// 자르면 규칙 행 자체가 범위 밖이라 빠져 버린다(그 회차는 범위 안인데도). 그래서 행은 전부
/// 가져오고 **전개는 클라이언트가** 한다 — 웹판과 같은 선택이다.
/// 둘이 쓰는 앱이라 행 수가 문제될 규모가 아니다.
final eventsProvider = FutureProvider<List<EventRow>>((ref) async {
  final coupleId = ref.watch(coupleIdProvider);
  if (coupleId == null || !Env.supabaseConfigured) return const [];
  final rows = await db
      .from('events')
      .select(eventsSelect)
      .eq('couple_id', coupleId)
      .isFilter('deleted_at', null)
      .order('start');
  return rows.map(EventRow.fromJson).toList(growable: false);
});
