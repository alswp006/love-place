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

/// 공유 자동 전파(§5.1) — 상대가 places/wishes/visits를 바꾸면 즉시 무효화.
/// 화면(MapTab)이 watch하는 동안만 구독이 살아 있다(autoDispose).
final realtimeSyncProvider = Provider.autoDispose<void>((ref) {
  final coupleId = ref.watch(coupleIdProvider);
  if (coupleId == null || !Env.supabaseConfigured) return;

  RealtimeChannel channel = db.channel('places:$coupleId');
  void invalidateFor(String table) {
    switch (table) {
      case 'places':
        ref.invalidate(placesProvider);
      case 'wishes':
        ref.invalidate(wishesProvider);
      case 'visits':
        ref.invalidate(visitedIdsProvider);
    }
  }

  for (final table in const ['places', 'wishes', 'visits']) {
    channel = channel.onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: table,
      filter: PostgresChangeFilter(
        type: PostgresChangeFilterType.eq,
        column: 'couple_id',
        value: coupleId,
      ),
      callback: (_) => invalidateFor(table),
    );
  }
  channel.subscribe();
  ref.onDispose(() => db.removeChannel(channel));
});
