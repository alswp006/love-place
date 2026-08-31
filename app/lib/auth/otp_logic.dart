/// OTP 로그인 순수 로직 — 웹판 `useSignInWithOtp`의 검증·에러 매핑 이식.
library;

final _emailRe = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
/// 메일 OTP 자릿수 — Supabase 프로젝트의 `mailer_otp_length`와 **반드시** 같아야 한다.
/// 서버는 8인데 앱이 6으로 못박고 있어서, 코드가 와도 입력이 거부되는 상태였다
/// (2026-08-31 확인). 서버 설정을 바꾸는 대신 앱을 맞춘다 — 8자리가 더 안전하고,
/// 인증 설정 변경은 웹판까지 함께 흔든다.
const otpLength = 8;

final _codeRe = RegExp('^\\d{$otpLength}\$');
final _rateLimitRe = RegExp('rate.?limit', caseSensitive: false);

bool isValidEmail(String email) => _emailRe.hasMatch(email.trim());

bool isValidOtpCode(String code) => _codeRe.hasMatch(code.trim());

/// 메일 재전송 한도(레이트리밋) 에러 판별 — 친화 카피로 매핑(R3.6).
bool isRateLimited({String? message, String? statusCode}) {
  if (statusCode == '429') return true;
  return message != null && _rateLimitRe.hasMatch(message);
}

const invalidEmailMsg = '올바른 이메일 주소를 입력해주세요.';
const invalidCodeMsg = '$otpLength자리 코드를 입력해주세요.';
const rateLimitedMsg = '잠시 후 다시 시도해 주세요 (메일 재전송 한도)';
const notConfiguredMsg = 'Supabase 설정이 아직 없어요. dart-define으로 URL·키를 넣어주세요.';
