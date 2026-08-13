/// 찜(wish) 상태 도출 — 순수 함수.
///
/// 웹판 `src/lib/places/wishStatus.ts`의 충실한 이식. 규칙은 한 글자도 바꾸지 않는다:
/// "가고싶음 = wishes 존재"(CLAUDE.md §7) — 상태 플래그를 만들지 않고 wishes에서 런타임 도출한다.
library;

/// place별 찜 집계.
class WishInfo {
  const WishInfo({
    this.userIds = const [],
    this.totalPriority = 0,
    this.maxPriority = 0,
  });

  /// 누가 찜했나(중복 제거, 커플 멤버 ≤2).
  final List<String> userIds;

  /// 우선순위(하트) 합 — 정렬용.
  final int totalPriority;

  /// 최고 우선순위 — 표시용.
  final int maxPriority;
}

/// 한 장소의 찜 상태(보는 사람 기준).
class WishStatus {
  const WishStatus({
    required this.wishedByMe,
    required this.wishedByPartner,
    required this.bothWished,
    required this.wishCount,
    required this.totalPriority,
    required this.maxPriority,
  });

  final bool wishedByMe;
  final bool wishedByPartner;

  /// 둘 다 찜 = 커플 앱 핵심 신호(§4.2).
  final bool bothWished;
  final int wishCount;
  final int totalPriority;
  final int maxPriority;
}

/// 우선순위 하트 최대 단계.
const int maxPriorityStep = 3;

/// wishInfo + 내 user id → 보는 사람 기준 상태.
///
/// [myId]가 null(세션 미로딩)이어도 [WishStatus.bothWished]는 인원수로 견고하게 도출한다
/// (place×user UNIQUE + 멤버 ≤2이므로 2명이면 둘 다 찜).
WishStatus deriveWishStatus(WishInfo? info, String? myId) {
  final userIds = info?.userIds ?? const <String>[];
  final wishedByMe = myId != null && userIds.contains(myId);
  // myId 미상(세션 미로딩)이면 '상대 것'으로 단정하지 않는다
  // ('나만 찜'→'상대만 찜' 일시 오표시 방지).
  final wishedByPartner = myId != null && userIds.any((id) => id != myId);
  return WishStatus(
    wishedByMe: wishedByMe,
    wishedByPartner: wishedByPartner,
    bothWished: userIds.length >= 2,
    wishCount: userIds.length,
    totalPriority: info?.totalPriority ?? 0,
    maxPriority: info?.maxPriority ?? 0,
  );
}

/// 정렬 비교자: 둘 다 찜 → 찜 인원 → 우선순위 합. 동률=0.
int compareByWish(WishStatus a, WishStatus b) {
  if (a.bothWished != b.bothWished) return a.bothWished ? -1 : 1;
  if (a.wishCount != b.wishCount) return b.wishCount - a.wishCount;
  if (a.totalPriority != b.totalPriority) {
    return b.totalPriority - a.totalPriority;
  }
  return 0;
}

/// 하트 탭 시 우선순위 순환: 0→1→2→3→0.
int cyclePriority(int current) =>
    current >= maxPriorityStep ? 0 : current + 1;

/// places에 wish 상태를 붙이고 "뭐부터 갈까" 순으로 정렬.
///
/// 입력이 created_at desc면 동률은 최신순을 유지해야 한다. Dart의 [List.sort]는
/// **안정 정렬이 아니므로**(JS Array.sort와 다른 점) 원래 인덱스를 타이브레이커로 넣어
/// 웹판과 같은 결과를 보장한다.
List<({T place, WishStatus wish})> attachAndSortWishes<T>(
  List<T> places,
  Map<String, WishInfo> wishes,
  String? myId, {
  required String Function(T) idOf,
}) {
  final indexed = <({T place, WishStatus wish, int order})>[];
  for (var i = 0; i < places.length; i++) {
    final p = places[i];
    indexed.add((
      place: p,
      wish: deriveWishStatus(wishes[idOf(p)], myId),
      order: i,
    ));
  }
  indexed.sort((a, b) {
    final c = compareByWish(a.wish, b.wish);
    return c != 0 ? c : a.order.compareTo(b.order);
  });
  return indexed.map((e) => (place: e.place, wish: e.wish)).toList();
}
