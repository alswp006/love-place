/// 앱 게이트 — 웹판 라우트 가드의 이식: 비로그인 → 로그인, 로그인+ACTIVE 커플 → 지도.
///
/// (couple 미연결 → 온보딩 가드는 연결 화면과 함께 다음 단계. 지금은
/// ensure_solo_couple이 모든 로그인을 ACTIVE로 만들어 주므로 실패만 안내한다.)
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth/login_screen.dart';
import 'core/env.dart';
import 'core/supabase.dart';
import 'map/map_screen.dart';
import 'state/auth.dart';
import 'state/couple.dart';
import 'state/places.dart';

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
        return const MapTab();
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
    return Stack(
      children: [
        Positioned.fill(child: MapScreen(places: places)),
        // 첫 로딩만 표시(마커 0개로 오해하지 않게). 갱신 중엔 이전 값이 이미 떠 있다.
        if (loading && places.isEmpty)
          const Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(child: LinearProgressIndicator(minHeight: 2)),
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
