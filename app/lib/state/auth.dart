/// 세션 상태 — 웹판 `state/auth.tsx`(onAuthStateChange 구독 단일 관리)의 이식.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/env.dart';
import '../core/supabase.dart';

/// auth 이벤트 스트림. 미설정 빌드에서는 빈 스트림(셸은 뜬다).
final authStateProvider = StreamProvider<AuthState>((ref) {
  if (!Env.supabaseConfigured) return const Stream.empty();
  return db.auth.onAuthStateChange;
});

/// 현재 사용자. 스트림 이벤트가 오기 전에는 currentSession으로 초기값을 잡는다
/// (콜드스타트에서 로그인 화면이 깜빡이지 않게).
final currentUserProvider = Provider<User?>((ref) {
  if (!Env.supabaseConfigured) return null;
  final state = ref.watch(authStateProvider);
  return state.value?.session?.user ?? db.auth.currentSession?.user;
});
