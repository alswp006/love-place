/// wishes 행 → place별 집계 + 내 위시 상세. 순수 함수.
///
/// 웹판 `useWishes.ts` queryFn 본문의 충실한 이식 — 쿼리와 가공을 분리해
/// 가공만 여기서 테스트한다.
library;

import 'place_row.dart';
import 'wish_status.dart';

/// 내(myId) 위시 행 — 우선순위 변경은 낙관적 락(version 조건부)에 version이 필요.
class MyWish {
  const MyWish({
    required this.wishId,
    required this.priority,
    required this.version,
  });
  final String wishId;
  final int priority;
  final int version;
}

class WishData {
  const WishData({this.byPlace = const {}, this.mine = const {}});
  final Map<String, WishInfo> byPlace;
  final Map<String, MyWish> mine;
}

WishData aggregateWishes(List<WishRow> rows, String? myId) {
  final byPlace = <String, WishInfo>{};
  final mine = <String, MyWish>{};
  for (final row in rows) {
    final cur = byPlace[row.placeId] ??
        const WishInfo(userIds: [], totalPriority: 0, maxPriority: 0);
    final userIds = cur.userIds.contains(row.userId)
        ? cur.userIds
        : [...cur.userIds, row.userId];
    byPlace[row.placeId] = WishInfo(
      userIds: userIds,
      totalPriority: cur.totalPriority + row.priority,
      maxPriority: row.priority > cur.maxPriority ? row.priority : cur.maxPriority,
    );
    if (myId != null && row.userId == myId) {
      mine[row.placeId] = MyWish(
        wishId: row.id,
        priority: row.priority,
        version: row.version,
      );
    }
  }
  return WishData(byPlace: byPlace, mine: mine);
}
