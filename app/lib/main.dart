/// Weave — 걸은 만큼 남는 커플 지도 (Flutter 네이티브판).
///
/// 슬라이스 상태: 지도 화면(마커·클러스터·시트·내 위치)까지. 인증·데이터 연결은
/// 다음 단계 — 그때까지 빈 장소 목록으로 셸을 띄운다(다층 빈 상태, ux §7).
library;

import 'package:flutter/material.dart';
import 'package:flutter_naver_map/flutter_naver_map.dart';

import 'core/env.dart';
import 'core/supabase.dart' as core;
import 'map/map_screen.dart';

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
  runApp(const WeaveApp());
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
      home: const MapScreen(places: []),
    );
  }
}
