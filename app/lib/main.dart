/// Weave — 걸은 만큼 남는 커플 지도 (Flutter 네이티브판).
///
/// 슬라이스 상태: 인증(OTP) → 커플 게이트 → 지도(실데이터 + Realtime)까지.
library;

import 'package:flutter/material.dart';
import 'package:flutter_naver_map/flutter_naver_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_shell.dart';
import 'core/env.dart';
import 'core/supabase.dart' as core;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await core.initSupabase();
  if (Env.naverMapConfigured) {
    // 네이티브 SDK 인증 — NCP client id 직접 전달. 웹판의 호스트 위장
    // (capacitor.config.ts server.hostname)이 여기서 공식적으로 소멸한다.
    await FlutterNaverMap().init(
      clientId: Env.naverMapClientId,
      onAuthFailed: (e) => debugPrint('네이버 지도 인증 실패: $e'),
    );
  }
  runApp(const ProviderScope(child: WeaveApp()));
}

class WeaveApp extends StatelessWidget {
  const WeaveApp({super.key});

  @override
  Widget build(BuildContext context) {
    // 다크모드 기본 지원(ux §4) — 시스템 설정을 따른다.
    return MaterialApp(
      title: 'Weave',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFFB03D5B)),
        useMaterial3: true,
      ),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFFD93A7),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: const AppShell(),
    );
  }
}
