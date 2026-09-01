/// trips 데이터 계층 — 웹판 `useTrips`의 이식.
///
/// places·events와 같은 규율: coupleId 기준 조회(RLS가 서버측 방어선),
/// Realtime은 무효화로 일원화.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/env.dart';
import '../core/supabase.dart';
import '../trips/trip_row.dart';
import 'couple.dart';

final tripsProvider = FutureProvider<List<TripRow>>((ref) async {
  final coupleId = ref.watch(coupleIdProvider);
  if (coupleId == null || !Env.supabaseConfigured) return const [];
  final rows = await db
      .from('trips')
      .select(tripsSelect)
      .eq('couple_id', coupleId)
      .isFilter('deleted_at', null)
      .order('start_date', ascending: false);
  return rows.map(TripRow.fromJson).toList(growable: false);
});
