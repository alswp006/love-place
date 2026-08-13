import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:weave/auth/login_screen.dart';
import 'package:weave/auth/otp_logic.dart';

// 테스트 빌드에는 dart-define이 없어 Env.supabaseConfigured=false —
// 네트워크 없이 검증·에러 표시 경로를 확인한다(인라인 에러 + 입력값 보존, ux §7).
void main() {
  Future<void> pump(WidgetTester tester) => tester
      .pumpWidget(const MaterialApp(home: LoginScreen()));

  testWidgets('이메일 입력과 코드 받기 버튼이 뜬다', (tester) async {
    await pump(tester);
    expect(find.text('이메일'), findsOneWidget);
    expect(find.text('로그인 코드 받기'), findsOneWidget);
  });

  testWidgets('불량 이메일 → 인라인 에러 + 입력값 보존', (tester) async {
    await pump(tester);
    await tester.enterText(find.byType(TextField), 'not-an-email');
    await tester.tap(find.text('로그인 코드 받기'));
    await tester.pump();
    expect(find.text(invalidEmailMsg), findsOneWidget);
    // 입력값이 날아가지 않는다(ux §7 — 에러 시 입력 보존).
    expect(find.text('not-an-email'), findsOneWidget);
  });

  testWidgets('정상 이메일이지만 Supabase 미설정 → 설정 안내', (tester) async {
    await pump(tester);
    await tester.enterText(find.byType(TextField), 'a@b.co');
    await tester.tap(find.text('로그인 코드 받기'));
    await tester.pump();
    expect(find.text(notConfiguredMsg), findsOneWidget);
  });
}
