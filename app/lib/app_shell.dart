/// 앱 게이트 — 웹판 라우트 가드의 이식: 비로그인 → 로그인, 로그인+ACTIVE 커플 → 지도.
///
/// (couple 미연결 → 온보딩 가드는 연결 화면과 함께 다음 단계. 지금은
/// ensure_solo_couple이 모든 로그인을 ACTIVE로 만들어 주므로 실패만 안내한다.)
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/tab_scaffold.dart';
import 'auth/login_screen.dart';
import 'calendar/calendar_screen.dart';
import 'couple/us_screen.dart';
import 'places/places_screen.dart';
import 'trips/trips_screen.dart';
import 'core/env.dart';
import 'core/supabase.dart';
import 'map/map_screen.dart';
import 'places/save_place.dart';
import 'state/auth.dart';
import 'state/couple.dart';
import 'state/offline.dart';
import 'state/places.dart';
import 'state/wish_mutations.dart';
import 'sync/offline_executor.dart';

class AppShell extends ConsumerWidget {
  const AppShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // 미설정 빌드(골든 테스트·시크릿 없는 CI)는 로그인 없이 셸을 보여준다 —
    // 지도 위젯이 자체 "설정 없음" 상태를 그린다.
    if (!Env.supabaseConfigured) return const MapScreen(places: []);

    final user = ref.watch(currentUserProvider);
    if (user == null) return const LoginScreen();

    final couple = ref.watch(coupleProvider);
    return couple.when(
      loading: () => const _CenteredLoading(label: '우리 공간을 여는 중'),
      error: (e, _) => _GateError(message: '$e'),
      data: (info) {
        if (!info.isActive) {
          // ensure_solo_couple까지 실패한 예외 상황 — 죽은 화면 대신 안내+로그아웃.
          return const _GateError(
              message: '커플 공간을 만들지 못했어요. 잠시 후 다시 시도해주세요.');
        }
        // 탭 셸 — 순서는 tabs.dart가 단일 출처다(지도·일정).
        // Realtime 구독은 각 탭이 아니라 여기서 한 번만 잡는다(IndexedStack이라 둘 다 살아 있다).
        return const TabScaffold(
            screens: [
          MapTab(),
          CalendarScreen(),
          TripsScreen(),
          PlacesScreen(),
          UsScreen()
        ]);
      },
    );
  }
}

/// 지도 탭 — 데이터 연결의 합류점. Realtime 구독은 이 위젯이 살아 있는 동안만.
class MapTab extends ConsumerWidget {
  const MapTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(realtimeSyncProvider); // 구독 유지(§5.1 공유 자동 전파)
    final loading = ref.watch(placesProvider).isLoading;
    final places = ref.watch(mapPlacesProvider);
    final coupleId = ref.watch(coupleIdProvider);
    final uid = ref.watch(currentUserProvider)?.id;
    final sync = ref.watch(offlineSyncProvider);

    // 동기화 충돌 보고(무음 덮어쓰기 금지 §4.3) — 배너 노출 후 카운트 리셋.
    ref.listen(offlineSyncProvider, (prev, next) {
      if (next.conflicts > (prev?.conflicts ?? 0)) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('동기화 충돌 ${next.conflicts}건 — 상대가 먼저 수정한 항목이 있어요'),
        ));
        ref.read(offlineSyncProvider.notifier).clearConflicts();
      }
    });

    return Stack(
      children: [
        Positioned.fill(
          child: MapScreen(
            places: places,
            onSaveHit: (coupleId == null || uid == null)
                ? null
                : (hit) async {
                    // 오프라인이면 큐 적재(웹판 useSavePlace의 navigator.onLine 분기).
                    if (ref.read(onlineProvider).value == false) {
                      await ref.read(offlineSyncProvider.notifier).enqueue(
                            'place.save',
                            placeSavePayload(
                                coupleId: coupleId, hit: hit, uid: uid),
                          );
                      return const QueuedOffline();
                    }
                    final result = await savePlace(db, coupleId, hit, uid);
                    // Realtime이 무효화를 밀어주지만, 내 쓰기는 즉시 반영(체감 지연 제거).
                    ref.invalidate(placesProvider);
                    ref.invalidate(wishesProvider);
                    return SavedNow(result);
                  },
            myWishOf: (placeId) =>
                ref.watch(wishesProvider).value?.mine[placeId],
            onSetPriority: uid == null
                ? null
                : ({
                    required wishId,
                    required expectedVersion,
                    required priority,
                  }) async {
                    final outcome = await ref
                        .read(wishMutationsProvider.notifier)
                        .setPriority(
                          wishId: wishId,
                          expectedVersion: expectedVersion,
                          priority: priority,
                          myId: uid,
                        );
                    if (!context.mounted) return;
                    // 충돌/큐 적재는 사용자에게 표시(무음 금지 §4.3).
                    final msg = switch (outcome) {
                      SetPriorityOutcome.conflict =>
                        '상대가 먼저 수정했어요. 최신 내용으로 새로고침했어요.',
                      SetPriorityOutcome.queued =>
                        '오프라인이에요 — 연결되면 자동으로 반영할게요',
                      SetPriorityOutcome.applied => null,
                    };
                    if (msg != null) {
                      ScaffoldMessenger.of(context)
                          .showSnackBar(SnackBar(content: Text(msg)));
                    }
                  },
          ),
        ),
        // 첫 로딩만 표시(마커 0개로 오해하지 않게). 갱신 중엔 이전 값이 이미 떠 있다.
        if (loading && places.isEmpty)
          const Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(child: LinearProgressIndicator(minHeight: 2)),
          ),
        // 대기 배지 — 아이콘+텍스트 이중화(§8). 큐가 비면 사라진다.
        if (sync.pending > 0)
          Positioned(
            top: 76, // 검색 오버레이 아래
            left: 0,
            right: 0,
            child: SafeArea(
              child: Center(
                child: Material(
                  color: Theme.of(context).colorScheme.secondaryContainer,
                  borderRadius: BorderRadius.circular(999),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 6),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.cloud_upload_outlined, size: 16),
                        const SizedBox(width: 6),
                        Text('저장 대기 ${sync.pending} — 연결되면 자동 동기화',
                            style: Theme.of(context).textTheme.labelMedium),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _CenteredLoading extends StatelessWidget {
  const _CenteredLoading({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 16),
            Text(label),
          ],
        ),
      ),
    );
  }
}

class _GateError extends StatelessWidget {
  const _GateError({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () => db.auth.signOut(),
                child: const Text('로그아웃'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
