/// places · wishes · visits 데이터 계층 — 웹판 usePlaces/useWishes/useVisits +
/// useRealtimePlaces의 이식.
///
/// 규율(web-stack.md §4.3·§4.4):
/// - 쿼리 키는 coupleId 기준(커플 격리). RLS가 서버측 방어선.
/// - Realtime 페이로드를 직접 머지하지 않는다 — **관련 provider 무효화**로 일원화
///   (서버가 정본, race 단순화).
/// - 채널은 provider 생명주기에 묶고 dispose에서 removeChannel(누수·중복 구독 금지).
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/env.dart';
import '../core/supabase.dart';
import '../map/map_view.dart';
import '../places/derive_map_places.dart';
import '../places/place_row.dart';
import '../places/wish_aggregate.dart';
import 'auth.dart';
import 'couple.dart';
import 'events.dart';

final placesProvider = FutureProvider<List<PlaceRow>>((ref) async {
  final coupleId = ref.watch(coupleIdProvider);
  if (coupleId == null || !Env.supabaseConfigured) return const [];
  final rows = await db
      .from('places')
      .select(
          'id, name, address, region_label, lat, lng, category, kakao_place_id, added_by, version')
      .eq('couple_id', coupleId)
      .isFilter('deleted_at', null)
      .order('created_at', ascending: false);
  return rows.map(PlaceRow.fromJson).toList();
});

final wishesProvider = FutureProvider<WishData>((ref) async {
  final coupleId = ref.watch(coupleIdProvider);
  final myId = ref.watch(currentUserProvider)?.id;
  if (coupleId == null || !Env.supabaseConfigured) return const WishData();
  final rows = await db
      .from('wishes')
      .select('id, place_id, user_id, priority, version')
      .eq('couple_id', coupleId)
      .isFilter('deleted_at', null);
  return aggregateWishes(rows.map(WishRow.fromJson).toList(), myId);
});

/// 가봤음 도출용 — 지도에 필요한 건 place_id 집합뿐(상세는 P3에서).
final visitedIdsProvider = FutureProvider<Set<String>>((ref) async {
  final coupleId = ref.watch(coupleIdProvider);
  if (coupleId == null || !Env.supabaseConfigured) return const {};
  final rows = await db
      .from('visits')
      .select('place_id')
      .eq('couple_id', coupleId)
      .isFilter('deleted_at', null);
  return rows
      .map((r) => r['place_id'])
      .whereType<String>()
      .toSet();
});

/// 지도 마커 입력 도출 — 로딩 중엔 이전 값 유지(지도가 깜빡 비지 않게).
final mapPlacesProvider = Provider<List<MapPlace>>((ref) {
  final places = ref.watch(placesProvider).value ?? const <PlaceRow>[];
  final wishes = ref.watch(wishesProvider).value ?? const WishData();
  final visited = ref.watch(visitedIdsProvider).value ?? const <String>{};
  return deriveMapPlaces(
    places: places,
    wishesByPlace: wishes.byPlace,
    visitedPlaceIds: visited,
  );
});

/// Realtime이 감시하는 테이블 = 무효화 대상 provider. **한 곳에서 도출**한다.
///
/// 예전엔 테이블 목록과 switch가 따로 있어서, 테이블을 더하면서 switch를 빠뜨리면
/// 구독은 되는데 화면이 안 갱신되는 무성 실패가 났다(추가하는 쪽이 눈치채기 어렵다).
/// 이제 이 맵 하나만 고치면 둘 다 따라온다.
Map<String, void Function(Ref)> _realtimeTargets() => {
      'places': (r) => r.invalidate(placesProvider),
      'wishes': (r) => r.invalidate(wishesProvider),
      'visits': (r) => r.invalidate(visitedIdsProvider),
      'events': (r) => r.invalidate(eventsProvider),
    };

/// 오프라인 큐 flush 뒤에도 같은 대상을 무효화한다 — 서버가 정본이므로 재조회로 일원화.
void invalidateSyncedData(Ref ref) {
  for (final f in _realtimeTargets().values) {
    f(ref);
  }
}

/// 공유 자동 전파(§5.1) — 상대가 바꾸면 즉시 무효화.
/// 화면(탭 셸)이 watch하는 동안만 구독이 살아 있다(autoDispose).
final realtimeSyncProvider = Provider.autoDispose<void>((ref) {
  final coupleId = ref.watch(coupleIdProvider);
  if (coupleId == null || !Env.supabaseConfigured) return;

  // 채널 이름은 커플 단위 하나 — 테이블마다 채널을 열면 연결이 늘고 정리가 새기 쉽다.
  RealtimeChannel channel = db.channel('couple:$coupleId');
  final targets = _realtimeTargets();

  for (final table in targets.keys) {
    channel = channel.onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: table,
      filter: PostgresChangeFilter(
        type: PostgresChangeFilterType.eq,
        column: 'couple_id',
        value: coupleId,
      ),
      callback: (_) => targets[table]!(ref),
    );
  }
  channel.subscribe();
  ref.onDispose(() => db.removeChannel(channel));
});
