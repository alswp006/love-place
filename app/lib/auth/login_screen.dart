/// 로그인 — 구글(1차) 또는 이메일 코드(2차).
///
/// 네이티브에서는 코드 입력이 **1차 경로**다(웹판 R5 결정: 매직링크는 PKCE
/// 교차컨텍스트 함정 — 링크를 여는 브라우저와 앱의 세션 저장소가 달라 깨진다.
/// OTP 코드는 그 함정이 원천적으로 없다). signInWithOtp에 redirect를 주지 않아
/// 메일의 코드 입력을 유도한다.
///
/// 구글을 1차로 올린 이유(2026-08-31): 이 프로젝트의 Supabase가 **무료 플랜 + 기본 발송기**라
/// 메일 템플릿을 못 고친다. 그래서 메일에 링크만 오고 코드가 안 온다 — OTP 경로가 서버 설정
/// 때문에 막혀 있다(발송 한도도 시간당 2통이라 어차피 출시용이 아니다).
/// 커스텀 SMTP를 붙이면 코드 경로가 그대로 되살아나므로 지우지 않고 아래에 남겨 둔다.
///
/// OAuth 콜백은 우리가 처리하지 않는다 — supabase_flutter가 app_links로 커스텀 스킴을 받아
/// PKCE code를 세션으로 교환하고, onAuthStateChange가 AppShell을 다시 그린다.
/// iOS는 SDK 기본값(platformDefault=SFSafariViewController)을 쓴다. 구글은 임베디드 웹뷰를
/// 차단하지만 SFSafariViewController는 별도 프로세스라 허용된다.
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

  /// Info.plist의 CFBundleURLSchemes 및 Supabase 리다이렉트 허용 목록과 **정확히** 같아야 한다.
  /// 셋 중 하나라도 어긋나면 브라우저가 돌아오지 못하고 로그인 화면에 그대로 남는다.
  static const _oauthRedirect = 'app.loveplace.weave://auth/callback';

  Future<void> _signInWithGoogle() async {
    setState(() => _error = null);
    if (!Env.supabaseConfigured) {
      setState(() => _error = notConfiguredMsg);
      return;
    }
    setState(() => _busy = true);
    try {
      await db.auth.signInWithOAuth(
        OAuthProvider.google,
        redirectTo: _oauthRedirect,
      );
      // 여기서 끝이 아니다 — 브라우저가 뜬 것뿐이고 세션은 딥링크로 돌아온다.
      // 사용자가 취소하고 돌아올 수도 있으므로 busy를 풀어 화면을 잠그지 않는다.
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '구글 로그인을 시작하지 못했어요. ($e)');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
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
                    // 1차 경로 — 메일을 거치지 않아 발송 한도·템플릿 제약과 무관하다.
                    FilledButton.icon(
                      onPressed: _busy ? null : _signInWithGoogle,
                      icon: const Icon(Icons.login),
                      label: const Text('구글로 로그인'),
                      style: FilledButton.styleFrom(
                        // 터치 타깃 ≥44px(HIG) — 첫 화면의 주 동작이라 넉넉히.
                        minimumSize: const Size.fromHeight(52),
                      ),
                    ),
                    const SizedBox(height: 20),
                    Row(children: [
                      const Expanded(child: Divider()),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Text('또는', style: theme.textTheme.bodySmall),
                      ),
                      const Expanded(child: Divider()),
                    ]),
                    const SizedBox(height: 20),
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
                    Text('${_email.text.trim()} 으로 보낸\n$otpLength자리 코드를 입력해주세요',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyMedium),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _code,
                      enabled: !_busy,
                      keyboardType: TextInputType.number,
                      maxLength: otpLength,
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
