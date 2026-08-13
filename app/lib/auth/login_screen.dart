/// 로그인 — 이메일 → 6자리 OTP 코드.
///
/// 네이티브에서는 코드 입력이 **1차 경로**다(웹판 R5 결정: 매직링크는 PKCE
/// 교차컨텍스트 함정 — 링크를 여는 브라우저와 앱의 세션 저장소가 달라 깨진다.
/// OTP 코드는 그 함정이 원천적으로 없다). signInWithOtp에 redirect를 주지 않아
/// 메일의 코드 입력을 유도한다.
library;

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/env.dart';
import '../core/supabase.dart';
import 'otp_logic.dart';

enum _Step { email, code }

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  _Step _step = _Step.email;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    setState(() => _error = null);
    final email = _email.text.trim();
    // 형식 검증이 설정 체크보다 먼저 — 입력 문제는 백엔드 없이도 알려줄 수 있다
    // (웹판은 설정 체크가 먼저였지만, 그 순서는 미설정 빌드에서 입력 피드백을 가린다).
    if (!isValidEmail(email)) {
      setState(() => _error = invalidEmailMsg);
      return;
    }
    if (!Env.supabaseConfigured) {
      setState(() => _error = notConfiguredMsg);
      return;
    }
    setState(() => _busy = true);
    try {
      await db.auth.signInWithOtp(email: email);
      if (!mounted) return;
      setState(() => _step = _Step.code);
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _error =
          isRateLimited(message: e.message, statusCode: e.statusCode)
              ? rateLimitedMsg
              : e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    setState(() => _error = null);
    final code = _code.text.trim();
    if (!isValidOtpCode(code)) {
      setState(() => _error = invalidCodeMsg);
      return;
    }
    setState(() => _busy = true);
    try {
      // 세션은 onAuthStateChange 스트림으로 전파 — 여기서 네비게이션하지 않는다
      // (AppShell 게이트가 세션을 보고 화면을 바꾼다).
      await db.auth.verifyOTP(
        email: _email.text.trim(),
        token: code,
        type: OtpType.email,
      );
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final onCode = _step == _Step.code;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Weave',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.headlineMedium),
                  const SizedBox(height: 4),
                  Text('걸은 만큼 남는 커플 지도',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyMedium),
                  const SizedBox(height: 32),
                  if (!onCode) ...[
                    TextField(
                      controller: _email,
                      enabled: !_busy,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      decoration: const InputDecoration(
                        labelText: '이메일',
                        border: OutlineInputBorder(),
                      ),
                      onSubmitted: (_) => _sendCode(),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _busy ? null : _sendCode,
                      child: _busy
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('로그인 코드 받기'),
                    ),
                  ] else ...[
                    Text('${_email.text.trim()} 으로 보낸\n6자리 코드를 입력해주세요',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyMedium),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _code,
                      enabled: !_busy,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      autofillHints: const [AutofillHints.oneTimeCode],
                      textAlign: TextAlign.center,
                      style: theme.textTheme.headlineSmall
                          ?.copyWith(letterSpacing: 8),
                      decoration: const InputDecoration(
                        counterText: '',
                        border: OutlineInputBorder(),
                      ),
                      onSubmitted: (_) => _verify(),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _busy ? null : _verify,
                      child: _busy
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('로그인'),
                    ),
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () => setState(() {
                                _step = _Step.email;
                                _code.clear();
                                _error = null;
                              }),
                      child: const Text('이메일 다시 입력'),
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    // 인라인 에러 + 입력값 보존(ux §7) — 화면 전환으로 날리지 않는다.
                    Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: TextStyle(color: theme.colorScheme.error),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
